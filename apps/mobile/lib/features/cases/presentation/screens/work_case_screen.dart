import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/limits/text_limits.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/case_payments/presentation/case_payments_card.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/deals/deal_record_card.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/desktop_cases.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_case_screen.dart'
    show routeSubscriptionError;
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_close_block.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_header.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_parts.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_sections.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/client_review_sheet.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/cases/presentation/widgets/private_details_card.dart';
import 'package:lawbid/features/cases/workspace/workspace_view.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/deadlines/presentation/deadline_entry.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart'
    show initialsOf;
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:url_launcher/url_launcher.dart';

/// docs/04 §8 + §11.2 "В работе": the case, the client's contacts (locked
/// behind the subscription, §8.3), "Не могу связаться" (§8.4) and, in
/// `pending_completion`, "Подтвердить выполнение" / "Оспорить" (§10.1).
class WorkCaseScreen extends ConsumerStatefulWidget {
  const WorkCaseScreen({
    required this.caseId,
    this.initialSection = CaseSection.overview,
    super.key,
  });

  final String caseId;

  /// The section a link asked for (`?tab=`).
  final CaseSection initialSection;

  @override
  ConsumerState<WorkCaseScreen> createState() => _WorkCaseScreenState();
}

class _WorkCaseScreenState extends ConsumerState<WorkCaseScreen> {
  bool _busy = false;
  bool _opening = false;
  final CaseSectionsBar _sections = CaseSectionsBar();

  @override
  void dispose() {
    _sections.dispose();
    super.dispose();
  }

  /// docs/05 §8: the case chat (the acceptance created it; this returns it).
  Future<void> _openChat(Translator t) async {
    if (_opening) return;
    setState(() => _opening = true);
    try {
      final conv =
          await ref.read(caseActionsProvider).openConversation(widget.caseId);
      if (mounted) await context.push(ChatRoutes.conversation(conv.id));
    } on Object catch (e) {
      if (mounted && !routeSubscriptionError(context, e, reason: 'chat')) {
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

  Future<void> _complete() async {
    final t = ref.read(translatorProvider);
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('cases.work.completeTitle'),
      message: t.t('cases.work.completeMessage'),
      confirmLabel: t.t('cases.work.complete'),
    );
    if (!ok) return;
    await _run(
      () => ref.read(caseActionsProvider).completeAsAttorney(widget.caseId),
      'cases.work.completed',
    );
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
      'cases.work.confirmed',
    );
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
      'cases.work.disputed',
    );
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

  Widget _workspace(
    BuildContext context,
    FeedCase c,
    Translator t,
    L10nFormats formats,
    AppColorTokens colors,
    bool pending,
  ) {
    final category = CaseFormat.practice(
      t,
      c.practice.categoryI18nKey ?? c.practice.i18nKey,
      c.practice.categoryNameEn ?? c.practice.nameEn,
    );
    final leaf = CaseFormat.practice(t, c.practice.i18nKey, c.practice.nameEn);
    EdgeInsets side(double top) => EdgeInsets.fromLTRB(
          AppSpacing.lg,
          top,
          AppSpacing.lg,
          0,
        );
    return CaseWorkspaceBody(
      caseId: c.id,
      isAttorney: true,
      sections: _sections,
      initialSection: widget.initialSection,
      chips: [category, if (leaf != category) leaf],
      statusLabel: c.status == CaseStatus.inProgress
          ? t.t('cases.status.acceptedByBoth')
          : caseStatusLabel(t, c.status),
      title: c.title,
      states: [c.primaryStateCode, ...c.additionalStateCodes],
      budget: c.budget,
      urgency: c.urgencyInfo,
      onRefresh: _refresh,
      categoryCode: c.practice.artCode,
      statusTone: caseTone(c.status),
      stage: caseStageOf(c.status, c.bidsCount),
      publishedAt: c.createdAt,
      overview: [
        // Deal record 2026-10-27: compact copy of the Docs-tab card.
        DealRecordCard(caseId: c.id, isAttorney: true, compact: true),
        // R-392: «Закрыть кейс» / «Подтвердить закрытие» / «Не закрывать».
        if (CaseCloseBlock.shown(c.status))
          Padding(
            padding: side(AppSpacing.md),
            child: CaseCloseBlock(
              caseId: c.id,
              status: c.status,
              isAttorney: true,
              requestedBy: c.completionRequestedBy,
              autoCloseAt: c.autoCloseAt,
              canAct: ref.watch(canDoProvider(AssistantDuty.bids)),
            ),
          ),
        if (c.status == CaseStatus.disputed)
          Padding(
            padding: side(AppSpacing.md),
            child: NoticeCard(
              icon: AppIcons.policyOutlined,
              tone: StatusTone.danger,
              message: t.t('cases.work.disputedNotice'),
            ),
          ),
        Padding(
          padding: side(AppSpacing.lg),
          child: _ContactsBlock(
            caseId: c.id,
            t: t,
            formats: formats,
          ),
        ),
        CaseText(
          text: c.description ?? '',
          moreLabel: t.t('post.more'),
        ),
        // Audit 2026-10-19: the client's «Подробности» for the hired
        // attorney, as text.
        PrivateDetailsCard(
          caseId: c.id,
          text: c.privateDetails,
          isOwner: false,
        ),
        if (c.ownBidId != null)
          Padding(
            padding: side(AppSpacing.lg),
            child: _TermsLine(bidId: c.ownBidId!, t: t, formats: formats),
          ),
        Padding(
          padding: side(AppSpacing.lg),
          child: CasePaymentsCard(caseId: c.id, asAttorney: true),
        ),
        // OQ-038: the hired attorney reviews the client (audit 2026-10-02:
        // in person — not an assistant in their name).
        if (!ref.watch(isAssistantProvider))
          Padding(
            padding: side(AppSpacing.md),
            child: ClientReviewAction(caseId: c.id),
          ),
        Padding(
          padding: side(AppSpacing.lg),
          child: Text(
            t.t('cases.overview.meta', {
              'published': formats.date(c.createdAt),
              'accepted': formats.date(c.createdAt),
              'bids': '${c.bidsCount}',
            }),
            style: Theme.of(context)
                .extension<AppTypographyTokens>()!
                .caption
                .copyWith(color: colors.textSecondary),
          ),
        ),
        // Audit 2026-10-19: the client's Overview had the case questions,
        // the hired attorney's had no way to them.
        AppListRow(
          icon: AppIcons.modeCommentOutlined,
          label: t.t('cases.comments.button'),
          onTap: () => context.push(AppRoutes.caseComments(c.id)),
        ),
        // Owner 2026-10-20: the deadline calculator, prefilled.
        CaseDeadlinesRow(
          caseId: c.id,
          stateCode: c.primaryStateCode,
          practiceCategory: c.practice.artCode,
          padding: side(AppSpacing.md),
        ),
      ],
    );
  }

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
          onPressed: () => closeCaseRoute(
            context,
            () => context.canPop() ? context.pop() : context.go(AppRoutes.mine),
          ),
        ),
        centerTitle: true,
        title: CaseSectionsTitle(
          bar: _sections,
          fallback: Text(t.t('cases.work.title')),
        ),
      ),
      body: AsyncDetailBody<FeedCase>(
        value: value,
        t: t,
        onRetry: _refresh,
        builder: (c) => AppRefreshIndicator(
          color: colors.gold,
          backgroundColor: colors.sheet,
          onRefresh: _refresh,
          child: _workspace(context, c, t, formats, colors, pending),
        ),
      ),
      bottomNavigationBar: c == null
          ? null
          : ListenableBuilder(
              listenable: _sections,
              builder: (context, _) => BottomActionBar(
                children: [
                  if (active && _sections.overviewShown)
                    ..._overviewActions(c, t),
                  // Owner 2026-11-05: the one chat of the screen.
                  AppButton(
                    key: const ValueKey('case-chat'),
                    label: t.t('cases.work.chatWithClient'),
                    icon: AppIcons.chatBubbleOutlineRounded,
                    isLoading: _opening,
                    onPressed: () => _openChat(t),
                  ),
                ],
              ),
            ),
    );
  }

  /// Owner 2026-11-05: no «…» — marking the case done and the rare actions
  /// stand at the bottom of the Overview, as the status allows.
  List<Widget> _overviewActions(FeedCase c, Translator t) {
    final pending = c.status == CaseStatus.pendingCompletion;
    final canBids = ref.watch(canDoProvider(AssistantDuty.bids));
    final issue = AppButton(
      key: const ValueKey('case-issue'),
      label: t.t('cases.issue.button'),
      variant: AppButtonVariant.secondary,
      onPressed: _cantReach,
    );
    if (pending && c.completionRequestedBy == 'client' && canBids) {
      return [
        AppButton(
          key: const ValueKey('case-confirm'),
          label: t.t('cases.work.confirm'),
          variant: AppButtonVariant.secondary,
          onPressed: _confirm,
        ),
        ButtonPair(
          left: AppButton(
            key: const ValueKey('case-dispute'),
            label: t.t('cases.work.dispute'),
            variant: AppButtonVariant.secondary,
            onPressed: _dispute,
          ),
          right: issue,
        ),
      ];
    }
    // Audit 2026-10-02: an assistant confirms or disputes only with "bids".
    // Owner 2026-10-02: either side may mark "Done" first.
    if (c.status == CaseStatus.inProgress && canBids) {
      return [
        ButtonPair(
          left: AppButton(
            key: const ValueKey('case-complete'),
            label: t.t('cases.work.complete'),
            variant: AppButtonVariant.secondary,
            onPressed: _complete,
          ),
          right: issue,
        ),
      ];
    }
    return [issue];
  }
}

class _TermsLine extends ConsumerWidget {
  const _TermsLine({
    required this.bidId,
    required this.t,
    required this.formats,
  });

  final String bidId;
  final Translator t;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(bidProvider(bidId));
    // Audit 2026-11-08 (L2): a refused bid (assistant without the duty)
    // leaves the line out instead of a skeleton that never ends.
    if (async.hasError && !async.hasValue) return const SizedBox.shrink();
    final bid = async.value;
    if (bid == null) return const AppSkeleton(height: AppSpacing.xl);
    return AppCard(
      onTap: () => context.push(AppRoutes.bid(bidId)),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  t.t('cases.owner.agreedTerms'),
                  style: Theme.of(context)
                      .extension<AppTypographyTokens>()!
                      .caption
                      .copyWith(
                        color: Theme.of(context)
                            .extension<AppColorTokens>()!
                            .textSecondary,
                      ),
                ),
                const SizedBox(height: AppSpacing.xs),
                MoneyText(
                  CaseFormat.terms(
                    t,
                    formats,
                    bid.feeType,
                    bid.amountCents,
                    percentBps: bid.percentBps,
                  ),
                ),
              ],
            ),
          ),
          AppIcon(
            AppIcons.chevronRightRounded,
            color: Theme.of(context).extension<AppColorTokens>()!.textSecondary,
          ),
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
  });

  final String caseId;
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
                    initials: initialsOf(
                      value.firstName,
                      value.lastName,
                      fallback: '·',
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Text(
                      value.fullName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: typography.roleTitle.copyWith(color: colors.text),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              if (value.phone != null)
                InfoRow(
                  icon: AppIcons.callOutlined,
                  label: t.t('cases.contacts.phone'),
                  value: value.phone!,
                ),
              if (value.email != null)
                InfoRow(
                  icon: AppIcons.alternateEmailRounded,
                  label: t.t('cases.contacts.email'),
                  value: value.email!,
                ),
              if (value.contactMethod != null)
                InfoRow(
                  icon: AppIcons.starOutlineRounded,
                  label: t.t('cases.contacts.preferred'),
                  value:
                      t.t('cases.contacts.method.${value.contactMethod!.json}'),
                ),
              if (value.contactNote != null &&
                  value.contactNote!.trim().isNotEmpty)
                InfoRow(
                  icon: AppIcons.scheduleRounded,
                  label: t.t('cases.contacts.note'),
                  value: value.contactNote!,
                ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  for (final (icon, key, uri) in [
                    (
                      AppIcons.callRounded,
                      'cases.contacts.call',
                      value.phone == null
                          ? null
                          : Uri(scheme: 'tel', path: value.phone)
                    ),
                    (
                      AppIcons.smsOutlined,
                      'cases.contacts.sms',
                      value.phone == null
                          ? null
                          : Uri(scheme: 'sms', path: value.phone)
                    ),
                    (
                      AppIcons.mailOutlineRounded,
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
                ],
              ),
            ],
          ),
        ),
      AsyncError(:final error)
          when error is ApiException &&
              error.code == ApiErrorCodes.subscriptionRequired =>
        NoticeCard(
          icon: AppIcons.lockOutlineRounded,
          message: t.t('cases.contacts.locked'),
          action: AppButton(
            label: t.t('cases.subscription.cta'),
            height: AppSizes.touchTarget,
            onPressed: () =>
                context.push(AppRoutes.subscriptionRequiredFor('contacts')),
          ),
        ),
      // Owner 2026-10-13: never a blank block — say why the contacts are
      // not here and let the attorney retry.
      AsyncError(:final error) => NoticeCard(
          icon: AppIcons.lockOutlineRounded,
          message: error is ApiException &&
                  error.code == ApiErrorCodes.contactsLocked
              ? t.t('cases.contacts.notShared')
              : errorText(t, error),
          action: AppButton(
            label: t.t('error.retry'),
            height: AppSizes.touchTarget,
            variant: AppButtonVariant.secondary,
            onPressed: () => ref.invalidate(clientContactsProvider(caseId)),
          ),
        ),
      _ => const AppContentCardSkeleton(),
    };
  }
}

class _ContactAction extends StatelessWidget {
  const _ContactAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

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
              minHeight: AppSizes.hitTarget + AppSpacing.md,
            ),
            decoration: BoxDecoration(
              color: colors.iconTintFill,
              borderRadius: BorderRadius.circular(AppRadii.field),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AppIcon(icon, color: colors.iconTint, size: AppSizes.iconSm),
                const SizedBox(height: AppSpacing.xs),
                // Four actions share the row: a long label shrinks to fit.
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.xs,
                  ),
                  child: FitText(
                    label,
                    textAlign: TextAlign.center,
                    style: typography.caption.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
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
              Text(
                t.t('cases.issue.title'),
                style: typography.titleMedium.copyWith(color: colors.text),
              ),
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
                tapAnywhere: true,
                maxLines: 3,
                maxLength: TextLimits.of(TextLimit.dispute),
                textCapitalization: TextCapitalization.sentences,
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: t.t('cases.issue.send'),
                disabledHint: t.t('form.disabled.required'),
                isEnabled: _type != null,
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
  const _TextSheet({
    required this.title,
    required this.label,
    required this.submit,
    required this.min,
  });

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
            Text(
              widget.title,
              style: typography.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: _text,
              label: widget.label,
              autofocus: true,
              tapAnywhere: true,
              maxLines: 4,
              maxLength: TextLimits.of(TextLimit.dispute),
              textCapitalization: TextCapitalization.sentences,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: widget.submit,
              isEnabled: _text.text.trim().length >= widget.min,
              onPressed: () => Navigator.of(context).pop(_text.text.trim()),
            ),
          ],
        ),
      ),
    );
  }
}
