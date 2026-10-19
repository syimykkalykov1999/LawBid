import 'dart:async';

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
import 'package:lawbid/features/case_payments/presentation/case_payments_card.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/active_case_cards.dart'
    show caseStageOf;
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/attorney_view_preview.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_header.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_invites_section.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_parts.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_photos.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_stale_banner.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_urgency_picker.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/cases/presentation/widgets/owner_case_dossier.dart';
import 'package:lawbid/features/cases/presentation/widgets/private_details_card.dart';
import 'package:lawbid/features/cases/presentation/widgets/review_nudge_sheet.dart';
import 'package:lawbid/features/cases/workspace/workspace_view.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_tab_pages.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/team/presentation/case_tasks_section.dart';

/// docs/04 §11.1 — the client's case: description, status actions, the
/// accepted attorney, and the bids (§5.2) with sorting.
class OwnerCaseScreen extends ConsumerStatefulWidget {
  const OwnerCaseScreen({required this.caseId, super.key});

  final String caseId;

  @override
  ConsumerState<OwnerCaseScreen> createState() => _OwnerCaseScreenState();
}

class _OwnerCaseScreenState extends ConsumerState<OwnerCaseScreen> {
  BidsSort _sort = BidsSort.newest;
  bool _busy = false;
  bool _nudged = false;

  CaseBidsKey get _bidsKey => (caseId: widget.caseId, sort: _sort);

  Future<void> _run(Future<void> Function() action, {String? doneKey}) async {
    if (_busy) return;
    setState(() => _busy = true);
    final t = ref.read(translatorProvider);
    try {
      await action();
      if (mounted && doneKey != null) showAppSnackBar(context, t.t(doneKey));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirm({
    required String title,
    required String message,
    required String confirm,
    required Future<void> Function() action,
    String? doneKey,
    bool destructive = false,
    bool popAfter = false,
  }) async {
    final t = ref.read(translatorProvider);
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t(title),
      message: t.t(message),
      confirmLabel: t.t(confirm),
      destructive: destructive,
    );
    if (!ok) return;
    await _run(action, doneKey: doneKey);
    if (popAfter && mounted && context.canPop()) context.pop();
  }

  Future<void> _dispute(OwnerCase c) async {
    final t = ref.read(translatorProvider);
    final controller = TextEditingController();
    final reason = await showAppBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          MediaQuery.viewInsetsOf(ctx).bottom + AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: controller,
              label: t.t('cases.work.disputeReason'),
              // Audit 2026-10-04: 1000, as the API and the lawyer form.
              maxLength: TextLimits.of(TextLimit.dispute),
              maxLines: 4,
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: t.t('cases.work.dispute'),
              onPressed: () {
                final v = controller.text.trim();
                if (v.isNotEmpty) Navigator.of(ctx).pop(v);
              },
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    if (reason == null) return;
    await _run(
      () => ref.read(caseActionsProvider).dispute(c.id, reason),
      doneKey: 'cases.work.disputed',
    );
  }

  void _maybeNudge(OwnerCase? c) {
    if (_nudged ||
        c == null ||
        c.status != CaseStatus.closed ||
        c.acceptedBid == null) {
      return;
    }
    _nudged = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final write = await maybeShowReviewNudge(context, ref, c.id);
      if (!write || !mounted) return;
      // ignore: use_build_context_synchronously
      unawaited(context.push(AppRoutes.reviewFormFor(c.id)));
    });
  }

  Future<void> _refresh() async {
    ref
      ..invalidate(ownerCaseProvider(widget.caseId))
      ..invalidate(caseBidsProvider(_bidsKey));
    await ref.read(ownerCaseProvider(widget.caseId).future);
  }

  void _openMenu(OwnerCase c) {
    final t = ref.read(translatorProvider);
    final actions = ref.read(caseActionsProvider);
    final canEdit = c.status == CaseStatus.open;
    final canClose = c.status == CaseStatus.open;
    final canDelete =
        c.status == CaseStatus.open || c.status == CaseStatus.archived;
    showActionSheet(context, [
      if (c.status == CaseStatus.inProgress)
        ActionSheetItem(
          icon: AppIcons.taskAltRounded,
          label: t.t('cases.owner.complete'),
          onTap: () => _confirm(
            title: 'cases.owner.completeTitle',
            message: 'cases.owner.completeMessage',
            confirm: 'cases.owner.complete',
            action: () => actions.complete(c.id),
            doneKey: 'cases.owner.completed',
          ),
        ),
      if (c.attorneyMarkedDone) ...[
        ActionSheetItem(
          icon: AppIcons.taskAltRounded,
          label: t.t('cases.owner.complete'),
          onTap: () => _confirm(
            title: 'cases.owner.confirmTitle',
            message: 'cases.owner.confirmMessage',
            confirm: 'cases.owner.complete',
            action: () => actions.confirmCompletion(c.id),
            doneKey: 'cases.owner.confirmed',
          ),
        ),
        ActionSheetItem(
          icon: AppIcons.policyOutlined,
          label: t.t('cases.work.dispute'),
          onTap: () => _dispute(c),
        ),
      ],
      if (canEdit)
        ActionSheetItem(
          icon: AppIcons.editOutlined,
          label: t.t('cases.owner.edit'),
          onTap: () => context.push(AppRoutes.myCaseEdit(c.id)),
        ),
      if (canClose)
        ActionSheetItem(
          icon: AppIcons.doNotDisturbOnOutlined,
          label: t.t('cases.owner.close'),
          onTap: () => _confirm(
            title: 'cases.owner.closeTitle',
            message: 'cases.owner.closeMessage',
            confirm: 'cases.owner.close',
            action: () => actions.closeCase(c.id),
            doneKey: 'cases.owner.closed',
          ),
        ),
      if (canDelete)
        ActionSheetItem(
          icon: AppIcons.deleteOutlineRounded,
          label: t.t('cases.owner.delete'),
          destructive: true,
          onTap: () => _confirm(
            title: 'cases.owner.deleteTitle',
            message: 'cases.owner.deleteMessage',
            confirm: 'cases.owner.delete',
            destructive: true,
            action: () => actions.deleteCase(c.id),
            doneKey: 'cases.owner.deleted',
            popAfter: true,
          ),
        ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    // Owner 2026-10-15: a finished case → a kind but firm ask for a review.
    _maybeNudge(ref.watch(ownerCaseProvider(widget.caseId)).value);
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(ownerCaseProvider(widget.caseId));
    final kase = value.value;
    final hasMenu = kase != null &&
        (kase.status == CaseStatus.open ||
            kase.status == CaseStatus.archived ||
            kase.status == CaseStatus.inProgress ||
            kase.attorneyMarkedDone);

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () =>
              context.canPop() ? context.pop() : context.go(AppRoutes.mine),
        ),
        title: Text(t.t('cases.owner.title')),
        actions: [
          if (hasMenu)
            TopBarIcon(
              icon: AppIcons.moreHorizRounded,
              label: t.t('cases.owner.actions'),
              onTap: () => _openMenu(kase),
            ),
        ],
      ),
      body: AsyncDetailBody<OwnerCase>(
        value: value,
        t: t,
        onRetry: _refresh,
        builder: (c) => RefreshIndicator(
          color: colors.gold,
          backgroundColor: colors.sheet,
          onRefresh: _refresh,
          child: _OwnerCaseBody(
            kase: c,
            t: t,
            formats: formats,
            sort: _sort,
            bidsKey: _bidsKey,
            onSort: (s) => setState(() => _sort = s),
          ),
        ),
      ),
      bottomNavigationBar: kase == null ? null : _bottomBar(kase, t),
    );
  }

  Widget? _bottomBar(OwnerCase c, Translator t) {
    final children = <Widget>[
      if (c.acceptedBid != null &&
          c.conversationId != null &&
          c.status != CaseStatus.open &&
          c.status != CaseStatus.archived)
        AppButton(
          label: t.t('cases.owner.chatWithLawyer'),
          icon: AppIcons.chatBubbleOutlineRounded,
          onPressed: () =>
              context.push(ChatRoutes.conversation(c.conversationId!)),
        ),
      if (c.status == CaseStatus.archived)
        AppButton(
          label: t.t('cases.owner.restore'),
          icon: AppIcons.unarchiveOutlined,
          isLoading: _busy,
          onPressed: () => _run(
            () => ref.read(caseActionsProvider).restoreCase(c.id),
            doneKey: 'cases.owner.restored',
          ),
        ),
      if (c.status == CaseStatus.closed && c.acceptedBid != null)
        AppButton(
          label: t.t('cases.owner.review'),
          icon: AppIcons.starOutlineRounded,
          variant: AppButtonVariant.secondary,
          onPressed: () => context.push(AppRoutes.reviewFormFor(c.id)),
        ),
    ];
    return children.isEmpty ? null : BottomActionBar(children: children);
  }
}

class _OwnerCaseBody extends ConsumerWidget {
  const _OwnerCaseBody({
    required this.kase,
    required this.t,
    required this.formats,
    required this.sort,
    required this.bidsKey,
    required this.onSort,
  });

  final OwnerCase kase;
  final Translator t;
  final L10nFormats formats;
  final BidsSort sort;
  final CaseBidsKey bidsKey;
  final ValueChanged<BidsSort> onSort;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = kase;
    final showBids = c.status != CaseStatus.inProgress &&
        c.status != CaseStatus.pendingCompletion &&
        c.status != CaseStatus.disputed;

    // Owner 2026-10-13: once a bid is accepted the case is a workspace:
    // Overview | Files | Tasks | Updates | Activity.
    if (c.acceptedBid != null && !showBids && c.status != CaseStatus.open) {
      final category = CaseFormat.practice(
        t,
        c.practice.categoryI18nKey ?? c.practice.i18nKey,
        c.practice.categoryNameEn ?? c.practice.nameEn,
      );
      final leaf =
          CaseFormat.practice(t, c.practice.i18nKey, c.practice.nameEn);
      return CaseWorkspaceBody(
        caseId: c.id,
        isAttorney: false,
        chips: [category, if (leaf != category) leaf],
        statusLabel: c.status == CaseStatus.inProgress
            ? t.t('cases.status.acceptedByBoth')
            : caseStatusLabel(t, c.status),
        title: c.title,
        states: [c.primaryStateCode, ...c.additionalStateCodes],
        budget: c.budget,
        urgency: c.urgencyInfo,
        onRefresh: () async => ref.invalidate(ownerCaseProvider(c.id)),
        categoryCode: c.practice.artCode,
        statusTone: caseTone(c.status),
        stage: caseStageOf(c.status, c.bidsCount),
        publishedAt: c.createdAt,
        overview: [
          if (c.status == CaseStatus.pendingCompletion)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.md,
                AppSpacing.lg,
                0,
              ),
              child: NoticeCard(
                icon: AppIcons.hourglassTopRounded,
                message: t.t(
                  c.attorneyMarkedDone
                      ? 'cases.owner.attorneyMarkedNotice'
                      : 'cases.owner.pendingNotice',
                  {
                    'date': c.autoCloseAt == null
                        ? ''
                        : formats.date(c.autoCloseAt!),
                  },
                ),
              ),
            ),
          if (c.status == CaseStatus.disputed)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.md,
                AppSpacing.lg,
                0,
              ),
              child: NoticeCard(
                icon: AppIcons.policyOutlined,
                tone: StatusTone.danger,
                message: t.t('cases.owner.disputedNotice'),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.lg,
              AppSpacing.lg,
              0,
            ),
            child: _AcceptedAttorneyCard(
              bid: c.acceptedBid!,
              t: t,
              formats: formats,
              conversationId: c.conversationId,
            ),
          ),
          CaseText(
            text: c.description,
            moreLabel: t.t('post.more'),
          ),
          // Audit 2026-10-19: «Подробности» stay readable and editable
          // once a bid is accepted.
          PrivateDetailsCard(
            caseId: c.id,
            text: c.privateDetails,
            isOwner: true,
            hired: true,
            onSaved: () => ref.invalidate(ownerCaseProvider(c.id)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.lg,
              AppSpacing.lg,
              0,
            ),
            child: CasePaymentsCard(caseId: c.id, asAttorney: false),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.lg,
              AppSpacing.lg,
              0,
            ),
            child: Text(
              t.t('cases.overview.meta', {
                'published': formats.date(c.createdAt),
                'accepted': formats.date(c.lastActivityAt),
                'bids': '${c.bidsCount}',
              }),
              style: typography.caption.copyWith(color: colors.textSecondary),
            ),
          ),
          AppListRow(
            icon: AppIcons.modeCommentOutlined,
            label: t.t('cases.comments.title'),
            onTap: () => context.push(AppRoutes.caseComments(c.id)),
          ),
        ],
      );
    }

    return _OwnerOpenCase(
      kase: c,
      t: t,
      formats: formats,
      sort: sort,
      bidsKey: bidsKey,
      onSort: onSort,
    );
  }
}

/// Owner 2026-10-15 («Экран кейса»): a case that is not yet in work — the
/// hero, then Overview · Bids · Files · Tasks.
class _OwnerOpenCase extends ConsumerStatefulWidget {
  const _OwnerOpenCase({
    required this.kase,
    required this.t,
    required this.formats,
    required this.sort,
    required this.bidsKey,
    required this.onSort,
  });

  final OwnerCase kase;
  final Translator t;
  final L10nFormats formats;
  final BidsSort sort;
  final CaseBidsKey bidsKey;
  final ValueChanged<BidsSort> onSort;

  @override
  ConsumerState<_OwnerOpenCase> createState() => _OwnerOpenCaseState();
}

class _OwnerOpenCaseState extends ConsumerState<_OwnerOpenCase> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final c = widget.kase;
    final t = widget.t;
    final formats = widget.formats;
    final sort = widget.sort;
    final bidsKey = widget.bidsKey;
    final onSort = widget.onSort;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final bids = ref.watch(caseBidsProvider(bidsKey));
    final states = [c.primaryStateCode, ...c.additionalStateCodes]
        .map(stateName)
        .join(', ');
    final showBids = c.status != CaseStatus.inProgress &&
        c.status != CaseStatus.pendingCompletion &&
        c.status != CaseStatus.disputed;
    final category = CaseFormat.practice(
      t,
      c.practice.categoryI18nKey ?? c.practice.i18nKey,
      c.practice.categoryNameEn ?? c.practice.nameEn,
    );
    final leaf = CaseFormat.practice(t, c.practice.i18nKey, c.practice.nameEn);
    final filesCount = c.photos.length;
    final tabs = [
      CaseTabItem(t.t('cases.tab.overview')),
      if (showBids) CaseTabItem(t.t('cases.tab.bids'), count: c.bidsCount),
      CaseTabItem(t.t('cases.tab.files'), count: filesCount),
      CaseTabItem(t.t('cases.tab.tasks')),
    ];
    final tab = _tab.clamp(0, tabs.length - 1);
    // Owner 2026-10-19 (Instagram): the case header scrolls away, the tab
    // row sticks, and Overview | Bids | Files | Tasks are pages side by
    // side — the next one slides in with the finger, a tap slides to it.
    final kinds = [
      'overview',
      if (showBids) 'bids',
      'files',
      'tasks',
    ];
    Widget sectionFor(String which) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (which == 'overview') ...[
                if (c.status == CaseStatus.pendingCompletion) ...[
                  const SizedBox(height: AppSpacing.lg),
                  NoticeCard(
                    icon: AppIcons.hourglassTopRounded,
                    message: t.t(
                      c.attorneyMarkedDone
                          ? 'cases.owner.attorneyMarkedNotice'
                          : 'cases.owner.pendingNotice',
                      {
                        'date': c.autoCloseAt == null
                            ? ''
                            : formats.date(c.autoCloseAt!),
                      },
                    ),
                  ),
                ],
                if (c.status == CaseStatus.disputed) ...[
                  const SizedBox(height: AppSpacing.lg),
                  NoticeCard(
                    icon: AppIcons.policyOutlined,
                    tone: StatusTone.danger,
                    message: t.t('cases.owner.disputedNotice'),
                  ),
                ],
                if (c.status == CaseStatus.archived) ...[
                  const SizedBox(height: AppSpacing.lg),
                  NoticeCard(
                    icon: AppIcons.inventory2Outlined,
                    message: t.t('cases.owner.archivedNotice'),
                  ),
                ],
                // OQ-054: «Вам ещё нужен адвокат?» / «Кейс скрыт · Вернуть».
                if (c.status == CaseStatus.open &&
                    CaseStaleBanner.needed(
                      paused: c.paused,
                      pending: c.stillNeededPending,
                    )) ...[
                  const SizedBox(height: AppSpacing.lg),
                  CaseStaleBanner(
                    caseId: c.id,
                    paused: c.paused,
                    pending: c.stillNeededPending,
                    canMakeNotUrgent: c.canMakeNotUrgent,
                    hidesAt: c.hidesAt,
                    archivesAt: c.archivesAt,
                  ),
                ],
                // Owner 2026-10-05: attorneys the client offered the case to.
                CaseInvitesSection(caseId: c.id),
                if (c.acceptedBid != null)
                  DetailSection(
                    title: t.t('cases.owner.attorneyAtWork'),
                    child: _AcceptedAttorneyCard(
                      bid: c.acceptedBid!,
                      t: t,
                      formats: formats,
                      conversationId: c.conversationId,
                    ),
                  ),
                DetailSection(
                  title: t.t('cases.detail.description'),
                  child: Text(
                    c.description,
                    style: typography.body.copyWith(color: colors.text),
                  ),
                ),
                // Audit 2026-10-19: the owner reads their «Подробности».
                PrivateDetailsCard(
                  caseId: c.id,
                  text: c.privateDetails,
                  isOwner: true,
                  padding: EdgeInsets.zero,
                  onSaved: c.status == CaseStatus.open
                      ? () => ref.invalidate(ownerCaseProvider(c.id))
                      : null,
                ),
                if (c.photos.isNotEmpty)
                  DetailSection(
                    title: t.t('cases.photos.title'),
                    child: CasePhotosStrip(photos: c.photos),
                  ),
                // Owner 2026-10-19: one row of two buttons — «Как выглядит
                // ваш кейс» (until a bid is accepted) and «Вопросы по
                // кейсу» (OQ-034: attorneys' questions under the case).
                const SizedBox(height: AppSpacing.lg),
                Row(
                  children: [
                    if (c.status == CaseStatus.open &&
                        c.acceptedBid == null) ...[
                      Expanded(
                        child: AppButton(
                          key: const ValueKey('case-preview-open'),
                          label: t.t('cases.preview.button'),
                          icon: AppIcons.visibilityOutlined,
                          variant: AppButtonVariant.secondary,
                          onPressed: () => showAttorneyViewPreview(
                            context,
                            item: AttorneyViewPreview.feedViewOf(c),
                            t: t,
                            formats: formats,
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                    ],
                    Expanded(
                      child: AppButton(
                        key: const ValueKey('case-questions-open'),
                        label: t.t('cases.comments.title'),
                        icon: AppIcons.modeCommentOutlined,
                        variant: AppButtonVariant.secondary,
                        onPressed: () =>
                            context.push(AppRoutes.caseComments(c.id)),
                      ),
                    ),
                  ],
                ),
                DetailSection(
                  title: t.t('cases.detail.details'),
                  child: FactsCard(
                    rows: [
                      CaseUrgencyRow(
                        caseId: c.id,
                        info: c.urgencyInfo,
                        canEdit: c.status == CaseStatus.open ||
                            c.status == CaseStatus.inProgress ||
                            c.status == CaseStatus.pendingCompletion,
                        hired: c.acceptedBid != null,
                        onSaved: () => ref.invalidate(ownerCaseProvider(c.id)),
                      ),
                      InfoRow(
                        icon: AppIcons.sellOutlined,
                        label: t.t('cases.card.budget'),
                        value: CaseFormat.budget(t, formats, c.budget),
                      ),
                      InfoRow(
                        icon: AppIcons.mapOutlined,
                        label: t.t('cases.field.states'),
                        value: states,
                      ),
                      if (c.city != null && c.city!.trim().isNotEmpty)
                        InfoRow(
                          icon: AppIcons.placeOutlined,
                          label: t.t('cases.field.city'),
                          value: c.city!,
                        ),
                      InfoRow(
                        icon: AppIcons.visibilityOutlined,
                        label: t.t('cases.detail.views'),
                        value: SocialFormat.count(formats, c.viewCount),
                      ),
                    ],
                  ),
                ),
              ],
              if (which == 'bids')
                DetailSection(
                  title: t.t(
                    'cases.bids.title',
                    {'count': SocialFormat.count(formats, c.bidsCount)},
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            for (final (s, key) in [
                              (BidsSort.newest, 'cases.bids.sortNewest'),
                              (BidsSort.lowestPrice, 'cases.bids.sortPrice'),
                              (
                                BidsSort.highestRating,
                                'cases.bids.sortRating',
                              ),
                            ]) ...[
                              AppChip(
                                label: t.t(key),
                                selected: sort == s,
                                onTap: () => onSort(s),
                              ),
                              const SizedBox(width: AppSpacing.sm),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      _BidsList(
                        value: bids,
                        t: t,
                        formats: formats,
                        bidsKey: bidsKey,
                      ),
                    ],
                  ),
                ),
              if (which == 'files')
                // Owner 2026-10-05: the client's case file and adding files.
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.md),
                  child: OwnerCaseDossier(kase: c),
                ),
              if (which == 'tasks')
                if (c.status != CaseStatus.archived)
                  CaseTasksSection(caseId: c.id, caseTitle: c.title),
            ],
          ),
        );
    final scale = MediaQuery.textScalerOf(context).scale(1);
    return ProfileTabPages(
      key: ValueKey('owner-case-pages-${kinds.length}'),
      initialPage: tab,
      onPage: (i) => setState(() => _tab = i),
      // The screen has its own pull-to-refresh around this view.
      tabBarHeight: 28 + 18 * scale,
      pagePadding: (_) => const EdgeInsets.only(bottom: AppSpacing.xxl),
      onNearEnd: (i) {
        if (kinds[i] == 'bids') {
          ref.read(caseBidsProvider(bidsKey).notifier).loadMore();
        }
      },
      header: CaseHero(
        t: t,
        formats: formats,
        practiceName: [
          category,
          if (leaf != category) leaf,
          for (final p in c.extraPractices)
            CaseFormat.practice(t, p.i18nKey, p.nameEn),
        ].join(' · '),
        categoryCode: c.practice.artCode,
        statusLabel: caseStatusLabelOf(t, c.status, paused: c.paused),
        statusTone: c.paused && c.status == CaseStatus.open
            ? StatusTone.neutral
            : caseTone(c.status),
        title: c.title,
        states: [c.primaryStateCode, ...c.additionalStateCodes],
        budget: c.budget,
        urgency: c.urgencyInfo,
        stage: caseStageOf(c.status, c.bidsCount),
        publishedAt: c.createdAt,
      ),
      tabBar: Builder(
        builder: (context) => CaseTextTabs(
          items: tabs,
          index: tab,
          onChanged: (i) {
            final pages = ProfileTabPages.controllerOf(context);
            if (pages != null && pages.hasClients) {
              pages.animateToPage(
                i,
                duration: context.reduceMotion
                    ? Duration.zero
                    : const Duration(milliseconds: 250),
                curve: Curves.easeOutCubic,
              );
            } else {
              setState(() => _tab = i);
            }
          },
        ),
      ),
      pages: [
        for (final w in kinds)
          ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: MediaQuery.sizeOf(context).height * 0.5,
            ),
            child: sectionFor(w),
          ),
      ],
    );
  }
}

class _BidsList extends ConsumerWidget {
  const _BidsList({
    required this.value,
    required this.t,
    required this.formats,
    required this.bidsKey,
  });

  final AsyncValue<dynamic> value;
  final Translator t;
  final L10nFormats formats;
  final CaseBidsKey bidsKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(caseBidsProvider(bidsKey));
    final notifier = ref.read(caseBidsProvider(bidsKey).notifier);
    return switch (async) {
      AsyncData(:final value) when value.items.isEmpty => Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
          // Audit 2026-10-04: AppEmptyState fills its parent's height — a
          // bounded box inside this ListView (unbounded made layout throw).
          child: SizedBox(
            height: 320,
            child: AppEmptyState(
              icon: AppIcons.gavelRounded,
              title: t.t('cases.bids.emptyTitle'),
              message: t.t('cases.bids.emptyMessage'),
            ),
          ),
        ),
      AsyncData(:final value) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < value.items.length; i++) ...[
              if (i > 0) const SizedBox(height: AppSpacing.md),
              AppEntrance(
                index: i < 6 ? i + 1 : 0,
                child: BidCard(
                  bid: value.items[i],
                  t: t,
                  formats: formats,
                  onTap: () => context.push(AppRoutes.bid(value.items[i].id)),
                  onAttorneyTap: value.items[i].attorney?.username.isNotEmpty ??
                          false
                      ? () => context.push(
                            AppRoutes.lawyer(value.items[i].attorney!.username),
                          )
                      : null,
                ),
              ),
            ],
            AppPaginationFooter(
              status: value.loadMoreError != null
                  ? AppPaginationStatus.error
                  : value.isLoadingMore
                      ? AppPaginationStatus.loading
                      : value.hasMore
                          ? AppPaginationStatus.idle
                          : AppPaginationStatus.end,
              labels: AppPaginationLabels(
                loadingMore: t.t('pagination.loadingMore'),
                error: t.t('pagination.error'),
                retry: t.t('error.retry'),
                end: t.t('pagination.end'),
              ),
              onRetry: notifier.retryLoadMore,
            ),
          ],
        ),
      AsyncError(:final error) => Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
          child: CasesErrorView(
            error: error,
            t: t,
            onRetry: () => ref.invalidate(caseBidsProvider(bidsKey)),
          ),
        ),
      _ => const Column(
          children: [
            AppContentCardSkeleton(),
            SizedBox(height: AppSpacing.md),
            AppContentCardSkeleton(),
          ],
        ),
    };
  }
}

class _AcceptedAttorneyCard extends StatelessWidget {
  const _AcceptedAttorneyCard({
    required this.bid,
    required this.t,
    required this.formats,
    required this.conversationId,
  });

  final CaseBid bid;
  final Translator t;

  /// docs/04 §9 / docs/05 §8: the chat opened by the acceptance.
  final String? conversationId;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = bid.attorney;
    return AppCard(
      elevated: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (a != null)
            AttorneyLine(
              attorney: a,
              t: t,
              formats: formats,
              onTap: a.username.isEmpty
                  ? null
                  : () => context.push(AppRoutes.lawyer(a.username)),
            ),
          const SizedBox(height: AppSpacing.md),
          MoneyText(
            CaseFormat.terms(
              t,
              formats,
              bid.feeType,
              bid.amountCents,
              percentBps: bid.percentBps,
            ),
            large: true,
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            CaseFormat.startLabel(
              t,
              formats,
              bid.startAvailability,
              bid.startDate,
            ),
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.lg),
          ButtonPair(
            left: AppButton(
              label: t.t('cases.owner.viewBid'),
              variant: AppButtonVariant.secondary,
              height: AppSizes.touchTarget,
              onPressed: () => context.push(AppRoutes.bid(bid.id)),
            ),
            right: AppButton(
              label: t.t('cases.chat.open'),
              icon: AppIcons.chatBubbleOutlineRounded,
              height: AppSizes.touchTarget,
              onPressed: conversationId == null
                  ? () => showAppSnackBar(context, t.t('cases.chat.soon'))
                  : () =>
                      context.push(ChatRoutes.conversation(conversationId!)),
            ),
          ),
        ],
      ),
    );
  }
}
