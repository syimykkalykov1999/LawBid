import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_header.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_photos.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';

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
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(ownerCaseProvider(widget.caseId));
    final kase = value.value;
    final hasMenu = kase != null &&
        (kase.status == CaseStatus.open || kase.status == CaseStatus.archived);

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
          backgroundColor: colors.surface,
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
    final actions = ref.read(caseActionsProvider);
    final children = <Widget>[
      if (c.status == CaseStatus.inProgress)
        AppButton(
          label: t.t('cases.owner.complete'),
          icon: AppIcons.taskAltRounded,
          isLoading: _busy,
          onPressed: () => _confirm(
            title: 'cases.owner.completeTitle',
            message: 'cases.owner.completeMessage',
            confirm: 'cases.owner.complete',
            action: () => actions.complete(c.id),
            doneKey: 'cases.owner.completed',
          ),
        ),
      if (c.status == CaseStatus.archived)
        AppButton(
          label: t.t('cases.owner.restore'),
          icon: AppIcons.unarchiveOutlined,
          isLoading: _busy,
          onPressed: () => _run(
            () => actions.restoreCase(c.id),
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
    final bids = ref.watch(caseBidsProvider(bidsKey));
    final states = [c.primaryStateCode, ...c.additionalStateCodes]
        .map(stateName)
        .join(', ');
    final showBids = c.status != CaseStatus.inProgress &&
        c.status != CaseStatus.pendingCompletion &&
        c.status != CaseStatus.disputed;

    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n.depth == 0 &&
            n.metrics.axis == Axis.vertical &&
            n.metrics.extentAfter < 400) {
          ref.read(caseBidsProvider(bidsKey).notifier).loadMore();
        }
        return false;
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: kDetailPadding,
        children: [
          CaseHeader(
            practice:
                CaseFormat.practice(t, c.practice.i18nKey, c.practice.nameEn),
            title: c.title,
            status: c.status,
            meta: t.t(
              'cases.detail.published',
              {'date': formats.date(c.createdAt)},
            ),
            t: t,
          ),
          if (c.status == CaseStatus.pendingCompletion) ...[
            const SizedBox(height: AppSpacing.lg),
            NoticeCard(
              icon: AppIcons.hourglassTopRounded,
              message: t.t('cases.owner.pendingNotice', {
                'date':
                    c.autoCloseAt == null ? '' : formats.date(c.autoCloseAt!),
              }),
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
          if (c.photos.isNotEmpty)
            DetailSection(
              title: t.t('cases.photos.title'),
              child: CasePhotosStrip(photos: c.photos),
            ),
          // OQ-034: attorneys' questions under the case; the owner answers.
          AppListRow(
            icon: AppIcons.modeCommentOutlined,
            label: t.t('cases.comments.title'),
            flush: true,
            onTap: () => context.push(AppRoutes.caseComments(c.id)),
          ),
          DetailSection(
            title: t.t('cases.detail.details'),
            child: FactsCard(
              rows: [
                InfoRow(
                  icon: AppIcons.paymentsOutlined,
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
          if (showBids)
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
                          (BidsSort.highestRating, 'cases.bids.sortRating'),
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
        ],
      ),
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
          child: AppEmptyState(
            icon: AppIcons.gavelRounded,
            title: t.t('cases.bids.emptyTitle'),
            message: t.t('cases.bids.emptyMessage'),
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
            CaseFormat.terms(t, formats, bid.feeType, bid.amountCents),
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
