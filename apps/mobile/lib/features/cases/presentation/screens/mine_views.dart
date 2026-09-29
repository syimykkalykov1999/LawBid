import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';

enum _ClientTab { cases, saved }

enum _AttorneyTab { bids, work, saved }

/// docs/04 §11.1 — client "Моё": "Мои кейсы" (Active / Archive / Closed)
/// and "Сохранённое" (posts, docs/05).
class ClientMineView extends ConsumerStatefulWidget {
  const ClientMineView({super.key});

  @override
  ConsumerState<ClientMineView> createState() => _ClientMineViewState();
}

class _ClientMineViewState extends ConsumerState<ClientMineView> {
  _ClientTab _tab = _ClientTab.cases;
  MyCasesFilter _filter = MyCasesFilter.active;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    return Column(
      children: [
        PillTabs<_ClientTab>(
          value: _tab,
          tabs: [
            (_ClientTab.cases, t.t('mine.tab.myCases')),
            (_ClientTab.saved, t.t('mine.tab.saved')),
          ],
          onChanged: (v) => setState(() => _tab = v),
        ),
        Expanded(
          child: AnimatedSwitcher(
            duration:
                context.reduceMotion ? Duration.zero : AppMotion.stateChange,
            child: _tab == _ClientTab.cases
                ? Column(
                    key: const ValueKey('cases'),
                    children: [
                      const SizedBox(height: AppSpacing.sm),
                      FilterChips<MyCasesFilter>(
                        value: _filter,
                        options: [
                          (MyCasesFilter.active, t.t('mine.filter.active')),
                          (MyCasesFilter.archived, t.t('mine.filter.archived')),
                          (MyCasesFilter.closed, t.t('mine.filter.closed')),
                        ],
                        onChanged: (v) => setState(() => _filter = v),
                      ),
                      Expanded(child: MyCasesList(filter: _filter)),
                    ],
                  )
                : const SavedPostsList(key: ValueKey('saved')),
          ),
        ),
      ],
    );
  }
}

/// "Мои кейсы" list — also used by the client profile tab (§11.3).
class MyCasesList extends ConsumerWidget {
  const MyCasesList({required this.filter, super.key});

  final MyCasesFilter filter;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final value = ref.watch(myCasesProvider(filter));
    final notifier = ref.read(myCasesProvider(filter).notifier);
    final ids = value.value?.items.map((c) => c.id).join(',') ?? '';
    final seen = ref.watch(seenBidCountsProvider(ids)).value ?? const {};
    return PagedListBody<CaseSummary>(
      value: value,
      t: t,
      itemKey: (c) => c.id,
      onRefresh: notifier.refresh,
      onLoadMore: notifier.loadMore,
      onRetryMore: notifier.retryLoadMore,
      empty: AppEmptyState(
        icon: Icons.folder_open_rounded,
        title: filter == MyCasesFilter.active
            ? t.t('mine.cases.emptyTitle')
            : null,
        message: filter == MyCasesFilter.active
            ? t.t('mine.cases.emptyMessage')
            : t.t('mine.cases.emptyFiltered'),
        action: filter == MyCasesFilter.active
            ? AppButton(
                label: t.t('mine.cases.create'),
                icon: Icons.add_rounded,
                height: AppSizes.touchTarget,
                onPressed: () => context.push(AppRoutes.create),
              )
            : null,
      ),
      itemBuilder: (context, c, _) => ClientCaseCard(
        item: c,
        unseenBids: (c.bidsCount - (seen[c.id] ?? 0)).clamp(0, c.bidsCount),
        t: t,
        formats: formats,
        onTap: () => context.push(AppRoutes.myCase(c.id)),
      ),
    );
  }
}

/// docs/04 §11.2 — attorney "Моё": "Мои биды", "В работе", "Сохранённое".
class AttorneyMineView extends ConsumerStatefulWidget {
  const AttorneyMineView({super.key});

  @override
  ConsumerState<AttorneyMineView> createState() => _AttorneyMineViewState();
}

class _AttorneyMineViewState extends ConsumerState<AttorneyMineView> {
  _AttorneyTab _tab = _AttorneyTab.bids;
  MyBidsFilter _bids = MyBidsFilter.active;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final Widget body = switch (_tab) {
      _AttorneyTab.bids => Column(
          key: const ValueKey('bids'),
          children: [
            const SizedBox(height: AppSpacing.sm),
            FilterChips<MyBidsFilter>(
              value: _bids,
              options: [
                (MyBidsFilter.active, t.t('mine.filter.active')),
                (MyBidsFilter.finished, t.t('mine.filter.finished')),
              ],
              onChanged: (v) => setState(() => _bids = v),
            ),
            Expanded(
              child: Consumer(
                builder: (context, ref, _) {
                  final value = ref.watch(myBidsProvider(_bids));
                  final n = ref.read(myBidsProvider(_bids).notifier);
                  return PagedListBody<MyBid>(
                    value: value,
                    t: t,
                    itemKey: (b) => b.bid.id,
                    onRefresh: n.refresh,
                    onLoadMore: n.loadMore,
                    onRetryMore: n.retryLoadMore,
                    empty: AppEmptyState(
                      icon: Icons.gavel_rounded,
                      message: t.t(_bids == MyBidsFilter.active
                          ? 'mine.bids.emptyActive'
                          : 'mine.bids.emptyFinished'),
                      action: _bids == MyBidsFilter.active
                          ? AppButton(
                              label: t.t('mine.bids.findCases'),
                              height: AppSizes.touchTarget,
                              variant: AppButtonVariant.secondary,
                              onPressed: () => context.go(AppRoutes.feed),
                            )
                          : null,
                    ),
                    itemBuilder: (context, b, _) => MyBidCard(
                      item: b,
                      t: t,
                      formats: formats,
                      onTap: () => context.push(AppRoutes.bid(b.bid.id)),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      _AttorneyTab.work => Consumer(
          key: const ValueKey('work'),
          builder: (context, ref, _) {
            final value = ref.watch(myWorkProvider(WorkFilter.active));
            final n = ref.read(myWorkProvider(WorkFilter.active).notifier);
            final showCompleted = Padding(
              padding: const EdgeInsets.only(top: AppSpacing.md),
              child: AppButton(
                label: t.t('mine.work.showCompleted'),
                icon: Icons.history_rounded,
                variant: AppButtonVariant.secondary,
                height: AppSizes.touchTarget,
                onPressed: () => context.push(AppRoutes.completedWork),
              ),
            );
            return PagedListBody<WorkItem>(
              value: value,
              t: t,
              itemKey: (w) => w.caseId,
              onRefresh: n.refresh,
              onLoadMore: n.loadMore,
              onRetryMore: n.retryLoadMore,
              header: const SizedBox(height: AppSpacing.xs),
              empty: AppEmptyState(
                icon: Icons.work_outline_rounded,
                message: t.t('mine.work.empty'),
                action: showCompleted,
              ),
              itemBuilder: (context, w, i) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  WorkCard(
                    item: w,
                    t: t,
                    formats: formats,
                    onTap: () => context.push(AppRoutes.workCase(w.caseId)),
                  ),
                  if (value.value != null &&
                      i == value.value!.items.length - 1 &&
                      !value.value!.hasMore)
                    showCompleted,
                ],
              ),
            );
          },
        ),
      _AttorneyTab.saved => const _AttorneySaved(key: ValueKey('saved')),
    };
    return Column(
      children: [
        PillTabs<_AttorneyTab>(
          value: _tab,
          tabs: [
            (_AttorneyTab.bids, t.t('mine.tab.myBids')),
            (_AttorneyTab.work, t.t('mine.tab.inWork')),
            (_AttorneyTab.saved, t.t('mine.tab.saved')),
          ],
          onChanged: (v) => setState(() => _tab = v),
        ),
        Expanded(
          child: AnimatedSwitcher(
            duration:
                context.reduceMotion ? Duration.zero : AppMotion.stateChange,
            child: body,
          ),
        ),
      ],
    );
  }
}

enum _SavedKind { cases, posts }

/// "Сохранённое" for attorneys: saved cases (docs/04) and posts (docs/05).
class _AttorneySaved extends ConsumerStatefulWidget {
  const _AttorneySaved({super.key});

  @override
  ConsumerState<_AttorneySaved> createState() => _AttorneySavedState();
}

class _AttorneySavedState extends ConsumerState<_AttorneySaved> {
  _SavedKind _kind = _SavedKind.cases;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    return Column(
      children: [
        const SizedBox(height: AppSpacing.sm),
        FilterChips<_SavedKind>(
          value: _kind,
          options: [
            (_SavedKind.cases, t.t('mine.saved.cases')),
            (_SavedKind.posts, t.t('mine.saved.posts')),
          ],
          onChanged: (v) => setState(() => _kind = v),
        ),
        Expanded(
          child: _kind == _SavedKind.cases
              ? const SavedCasesList()
              : const SavedPostsList(),
        ),
      ],
    );
  }
}

/// Saved cases of an attorney (docs/04 §11.2).
class SavedCasesList extends ConsumerWidget {
  const SavedCasesList({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final value = ref.watch(savedCasesProvider);
    final n = ref.read(savedCasesProvider.notifier);
    return PagedListBody<SavedCase>(
      value: value,
      t: t,
      itemKey: (s) => s.caseId,
      onRefresh: n.refresh,
      onLoadMore: n.loadMore,
      onRetryMore: n.retryLoadMore,
      header: const SizedBox(height: AppSpacing.xs),
      empty: AppEmptyState(
        icon: Icons.bookmark_outline_rounded,
        message: t.t('mine.saved.empty'),
      ),
      itemBuilder: (context, s, _) => s.available && s.card != null
          ? FeedCaseCard(
              item: s.card!,
              t: t,
              formats: formats,
              onTap: () => context.push(AppRoutes.caseDetail(s.caseId)),
            )
          : UnavailableCaseCard(
              title: s.title,
              t: t,
              onRemove: () async {
                await ref
                    .read(caseActionsProvider)
                    .setSaved(s.caseId, saved: false);
                n.removeWhere((x) => x.caseId == s.caseId);
              },
            ),
    );
  }
}

/// "Завершённые" (docs/04 §11.2): the attorney's closed cases.
class CompletedWorkScreen extends ConsumerWidget {
  const CompletedWorkScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(myWorkProvider(WorkFilter.closed));
    final n = ref.read(myWorkProvider(WorkFilter.closed).notifier);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => context.pop(),
        ),
        title: Text(t.t('mine.work.completedTitle')),
      ),
      body: PagedListBody<WorkItem>(
        value: value,
        t: t,
        itemKey: (w) => w.caseId,
        onRefresh: n.refresh,
        onLoadMore: n.loadMore,
        onRetryMore: n.retryLoadMore,
        empty: AppEmptyState(
            icon: Icons.history_rounded,
            message: t.t('mine.work.completedEmpty')),
        itemBuilder: (context, w, _) => WorkCard(
          item: w,
          t: t,
          formats: formats,
          onTap: () => context.push(AppRoutes.workCase(w.caseId)),
        ),
      ),
    );
  }
}
