import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_header.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_case_screen.dart'
    show routeSubscriptionError;
import 'package:lawbid/features/chat/chat_routes.dart';

/// docs/04 §8 + §11.2 "В работе": the case, the client's contacts (locked
/// behind the subscription, §8.3), "Не могу связаться" (§8.4) and, in
/// `pending_completion`, "Подтвердить выполнение" / "Оспорить" (§10.1).
class WorkCaseScreen extends ConsumerStatefulWidget {
  const WorkCaseScreen({required this.caseId, super.key});

  final String caseId;

  @override
  ConsumerState<WorkCaseScreen> createState() => _WorkCaseScreenState();
}

class _WorkCaseScreenState extends ConsumerState<WorkCaseScreen> {
  bool _busy = false;
  bool _opening = false;

  /// docs/05 §8: the case chat (the acceptance created it; this returns it).
  Future<void> _openChat(Translator t) async {
    if (_opening) return;
    setState(() => _opening = true);
    try {
      final conv =
          await ref.read(caseActionsProvider).openConversation(widget.caseId);
      if (mounted) await context.push(ChatRoutes.conversation(conv.id));
    } on Object catch (e) {
      if (mounted &&
          !routeSubscriptionError(context, e, reason: 'chat')) {
        showAppSnackBar(context, errorText(t, e));
      }
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  Future<void> _refresh() async {
    ref
      ..invalidate(attorneyCaseProvider(widget.caseId))
      ..invalidate(clientContactsProvider(widget.caseId));
    await ref.read(attorneyCaseProvider(widget.caseId).future);
    try {
      await ref.read(clientContactsProvider(widget.caseId).future);
    } on Object {
      // Locked contacts (subscription) render their own state.
    }
  }

  Future<void> _confirm() async {
    final t = ref.read(translatorProvider);
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('cases.work.confirmTitle'),
      message: t.t('cases.work.confirmMessage'),
      confirmLabel: t.t('cases.work.confirm'),
    );
    if (!ok) return;
    await _run(
        () => ref.read(caseActionsProvider).confirmCompletion(widget.caseId),
        'cases.work.confirmed');
  }

  Future<void> _dispute() async {
    final t = ref.read(translatorProvider);
    final reason = await _askText(
      title: t.t('cases.work.disputeTitle'),
      label: t.t('cases.work.disputeReason'),
      submit: t.t('cases.work.dispute'),
      min: 1,
    );
    if (reason == null) return;
    await _run(
        () => ref.read(caseActionsProvider).dispute(widget.caseId, reason),
        'cases.work.disputed');
  }

  Future<void> _cantReach() async {
    final t = ref.read(translatorProvider);
    final result = await showAppBottomSheet<(ContactIssueType, String)>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _ContactIssueSheet(t: t),
    );
    if (result == null) return;
    await _run(
      () => ref
          .read(caseActionsProvider)
          .reportContactIssue(widget.caseId, result.$1, result.$2),
      'cases.issue.sent',
    );
  }

  Future<void> _run(Future<void> Function() action, String doneKey) async {
    if (_busy) return;
    setState(() => _busy = true);
    final t = ref.read(translatorProvider);
    try {
      await action();
    } on Object catch (e) {
      if (mounted) {
        showAppSnackBar(context, errorText(t, e));
        setState(() => _busy = false);
      }
      return;
    }
    if (mounted) showAppSnackBar(context, t.t(doneKey));
    // The action went through; a failed reload must not look like it failed.
    try {
      await _refresh();
    } on Object {
      // The screen's own error state / pull-to-refresh covers it.
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<String?> _askText({
    required String title,
    required String label,
    required String submit,
    required int min,
  }) =>
      showAppBottomSheet<String>(
        context: context,
        isScrollControlled: true,
        builder: (context) =>
            _TextSheet(title: title, label: label, submit: submit, min: min),
      );

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(attorneyCaseProvider(widget.caseId));
    final c = value.value;
    final pending = c?.status == CaseStatus.pendingCompletion;
    final active = c != null &&
        (c.status == CaseStatus.inProgress ||
            c.status == CaseStatus.pendingCompletion ||
            c.status == CaseStatus.disputed);

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () =>
              context.canPop() ? context.pop() : context.go(AppRoutes.mine),
        ),
        title: Text(t.t('cases.work.title')),
      ),
      body: AsyncDetailBody<FeedCase>(
        value: value,
        t: t,
        onRetry: _refresh,
        builder: (c) => RefreshIndicator(
          color: colors.gold,
          backgroundColor: colors.surface,
          onRefresh: _refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: kDetailPadding,
            children: [
              CaseHeader(
                practice: CaseFormat.practice(
                    t, c.practice.i18nKey, c.practice.nameEn),
                title: c.title,
                status: c.status,
                meta: CaseFormat.place(
                    c.city, c.primaryStateCode, c.additionalStateCodes.length),
                t: t,
              ),
              if (pending) ...[
                const SizedBox(height: AppSpacing.lg),
                NoticeCard(
                    icon: Icons.hourglass_top_rounded,
                    message: t.t('cases.work.pendingNotice')),
              ],
              if (c.status == CaseStatus.disputed) ...[
                const SizedBox(height: AppSpacing.lg),
                NoticeCard(
                  icon: Icons.policy_outlined,
                  tone: StatusTone.danger,
                  message: t.t('cases.work.disputedNotice'),
                ),
              ],
              DetailSection(
                title: t.t('cases.contacts.title'),
                child: _ContactsBlock(
                  caseId: c.id,
                  t: t,
                  formats: formats,
                  onOpenChat: () => _openChat(t),
                ),
              ),
              if (c.ownBidId != null)
                DetailSection(
                  title: t.t('cases.work.terms'),
                  child: _TermsLine(bidId: c.ownBidId!, t: t, formats: formats),
                ),
              DetailSection(
                title: t.t('cases.detail.description'),
                child: Text(
                  c.description ?? '',
                  style: Theme.of(context)
                      .extension<AppTypographyTokens>()!
                      .body
                      .copyWith(color: colors.text),
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: !active
          ? null
          : BottomActionBar(
              children: [
                if (pending)
                  AppButton(
                    label: t.t('cases.work.confirm'),
                    icon: Icons.task_alt_rounded,
                    isLoading: _busy,
                    onPressed: _confirm,
                  ),
                if (pending)
                  AppButton(
                    label: t.t('cases.work.dispute'),
                    variant: AppButtonVariant.secondary,
                    onPressed: _busy ? null : _dispute,
                  ),
                AppButton(
                  label: t.t('cases.issue.button'),
                  icon: Icons.phone_disabled_outlined,
                  variant: AppButtonVariant.secondary,
                  onPressed: _busy ? null : _cantReach,
                ),
              ],
            ),
    );
  }
}

class _TermsLine extends ConsumerWidget {
  const _TermsLine(
      {required this.bidId, required this.t, required this.formats});

  final String bidId;
  final Translator t;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bid = ref.watch(bidProvider(bidId)).value;
    if (bid == null) return const AppSkeleton(height: AppSpacing.xl);
    return AppCard(
      onTap: () => context.push(AppRoutes.bid(bidId)),
      child: Row(
        children: [
          Expanded(
              child: MoneyText(
                  CaseFormat.terms(t, formats, bid.feeType, bid.amountCents))),
          Icon(Icons.chevron_right_rounded,
              color:
                  Theme.of(context).extension<AppColorTokens>()!.textSecondary),
        ],
      ),
    );
  }
}

/// §8.1 contacts with Call / SMS / Email / Chat; §8.3 locked state.
class _ContactsBlock extends ConsumerWidget {
  const _ContactsBlock({
    required this.caseId,
    required this.t,
    required this.formats,
    required this.onOpenChat,
  });

  final String caseId;
  final VoidCallback onOpenChat;
  final Translator t;
  final L10nFormats formats;

  Future<void> _launch(BuildContext context, Uri uri) async {
    if (!await launchUrl(uri) && context.mounted) {
      showAppSnackBar(context, t.t('cases.contacts.cantOpen'));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final value = ref.watch(clientContactsProvider(caseId));
    return switch (value) {
      AsyncData(:final value) => AppCard(
          elevated: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  AppAvatar(
                      initials: initialsOf(value.firstName, value.lastName),
                      size: AppSizes.cardAvatar),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Text(
                      value.fullName,
                      style: typography.roleTitle.copyWith(color: colors.text),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              if (value.phone != null)
                InfoRow(
                    icon: Icons.call_outlined,
                    label: t.t('cases.contacts.phone'),
                    value: value.phone!),
              if (value.email != null)
                InfoRow(
                    icon: Icons.alternate_email_rounded,
                    label: t.t('cases.contacts.email'),
                    value: value.email!),
              if (value.contactMethod != null)
                InfoRow(
                  icon: Icons.star_outline_rounded,
                  label: t.t('cases.contacts.preferred'),
                  value:
                      t.t('cases.contacts.method.${value.contactMethod!.json}'),
                ),
              if (value.contactNote != null &&
                  value.contactNote!.trim().isNotEmpty)
                InfoRow(
                    icon: Icons.schedule_rounded,
                    label: t.t('cases.contacts.note'),
                    value: value.contactNote!),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  for (final (icon, key, uri) in [
                    (
                      Icons.call_rounded,
                      'cases.contacts.call',
                      value.phone == null
                          ? null
                          : Uri(scheme: 'tel', path: value.phone)
                    ),
                    (
                      Icons.sms_outlined,
                      'cases.contacts.sms',
                      value.phone == null
                          ? null
                          : Uri(scheme: 'sms', path: value.phone)
                    ),
                    (
                      Icons.mail_outline_rounded,
                      'cases.contacts.mail',
                      value.email == null
                          ? null
                          : Uri(scheme: 'mailto', path: value.email)
                    ),
                  ]) ...[
                    Expanded(
                      child: _ContactAction(
                        icon: icon,
                        label: t.t(key),
                        onTap: uri == null ? null : () => _launch(context, uri),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                  ],
                  Expanded(
                    child: _ContactAction(
                      icon: Icons.chat_bubble_outline_rounded,
                      label: t.t('cases.chat.open'),
                      onTap: onOpenChat,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      AsyncError(:final error)
          when error is ApiException &&
              error.code == ApiErrorCodes.subscriptionRequired =>
        NoticeCard(
          icon: Icons.lock_outline_rounded,
          message: t.t('cases.contacts.locked'),
          action: AppButton(
            label: t.t('cases.subscription.cta'),
            height: AppSizes.touchTarget,
            onPressed: () =>
                context.push(AppRoutes.subscriptionRequiredFor('contacts')),
          ),
        ),
      AsyncError(:final error) => CasesErrorView(
          error: error,
          t: t,
          onRetry: () => ref.invalidate(clientContactsProvider(caseId)),
        ),
      _ => const AppContentCardSkeleton(),
    };
  }
}

class _ContactAction extends StatelessWidget {
  const _ContactAction(
      {required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      enabled: onTap != null,
      label: label,
      excludeSemantics: true,
      child: Opacity(
        opacity: onTap == null ? AppSizes.disabledOpacity : 1,
        child: AppPressable(
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(
                minHeight: AppSizes.hitTarget + AppSpacing.md),
            decoration: BoxDecoration(
              color: colors.goldTint,
              borderRadius: BorderRadius.circular(AppRadii.field),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: colors.goldDark, size: AppSizes.iconSm),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: typography.caption.copyWith(
                      color: colors.text, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// §8.4 "Не могу связаться": reason + comment.
class _ContactIssueSheet extends StatefulWidget {
  const _ContactIssueSheet({required this.t});

  final Translator t;

  @override
  State<_ContactIssueSheet> createState() => _ContactIssueSheetState();
}

class _ContactIssueSheetState extends State<_ContactIssueSheet> {
  ContactIssueType? _type;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = widget.t;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              const SizedBox(height: AppSpacing.lg),
              Text(t.t('cases.issue.title'),
                  style: typography.titleMedium.copyWith(color: colors.text)),
              const SizedBox(height: AppSpacing.md),
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: [
                  for (final type in kContactIssueTypes)
                    AppChip(
                      label: t.t('cases.issue.type.${type.json}'),
                      selected: _type == type,
                      onTap: () => setState(() => _type = type),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              AppTextField(
                controller: _note,
                label: t.t('cases.issue.comment'),
                maxLines: 3,
                maxLength: 1000,
                textCapitalization: TextCapitalization.sentences,
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: t.t('cases.issue.send'),
                isEnabled: _type != null,
                dimWhenDisabled: true,
                onPressed: () =>
                    Navigator.of(context).pop((_type!, _note.text)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TextSheet extends StatefulWidget {
  const _TextSheet(
      {required this.title,
      required this.label,
      required this.submit,
      required this.min});

  final String title;
  final String label;
  final String submit;
  final int min;

  @override
  State<_TextSheet> createState() => _TextSheetState();
}

class _TextSheetState extends State<_TextSheet> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            const SizedBox(height: AppSpacing.lg),
            Text(widget.title,
                style: typography.titleMedium.copyWith(color: colors.text)),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: _text,
              label: widget.label,
              autofocus: true,
              maxLines: 4,
              maxLength: 1000,
              textCapitalization: TextCapitalization.sentences,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: widget.submit,
              isEnabled: _text.text.trim().length >= widget.min,
              dimWhenDisabled: true,
              onPressed: () => Navigator.of(context).pop(_text.text.trim()),
            ),
          ],
        ),
      ),
    );
  }
}
