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
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/invites_list.dart';
import 'package:lawbid/features/cases/presentation/widgets/my_case_row.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/mine/presentation/widgets/mine_grid.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/team/presentation/tasks_tab.dart';

// Owner 2026-10-02: three tabs on top — Planner · Cases (Open · In progress ·
// Completed · Archive inside) · Saved.
enum _ClientTab { planner, cases, saved }

enum _CaseSection { open, inProgress, completed, archived }

// Owner 2026-10-01: two top tabs — My bids (with Active · In progress ·
// Completed · Finished · Saved inside) and the Planner (tasks calendar).
// Owner 2026-10-01: Planner first, My bids second.
enum _AttorneyTab { planner, bids }

enum _BidsSection { active, invites, work, completed, finished, saved }

/// Owner 2026-09-30 — client "Mine": Open (with Archive), In progress,
/// Completed and Saved (posts). Cases show as compact rows (owner
/// 2026-10-07, bug 16) — the first photo or the practice icon, the title,
/// the status and counts — with search by title and filters
/// (qualification, state).
class ClientMineView extends ConsumerStatefulWidget {
  const ClientMineView({super.key});

  @override
  ConsumerState<ClientMineView> createState() => _ClientMineViewState();
}

class _ClientMineViewState extends ConsumerState<ClientMineView> {
  _ClientTab _tab = _ClientTab.planner;
  _CaseSection _section = _CaseSection.open;
  MineSearch _search = const MineSearch();

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final filter = switch (_section) {
      _CaseSection.open => MyCasesFilter.open,
      _CaseSection.inProgress => MyCasesFilter.inProgress,
      _CaseSection.completed => MyCasesFilter.closed,
      // Audit 2026-10-04: archived cases were unreachable from Mine.
      _CaseSection.archived => MyCasesFilter.archived,
    };
    final body = switch (_tab) {
      // Owner 2026-10-01: clients keep a planner too (own tasks + steps).
      _ClientTab.planner => const TasksTab(key: ValueKey('planner')),
      _ClientTab.saved => const SavedPostsList(key: ValueKey('saved')),
      _ClientTab.cases => Column(
          key: const ValueKey('cases'),
          children: [
            MineSearchBar(
              search: _search,
              onChanged: (v) => setState(() => _search = v),
            ),
            MineActiveFilters(
              search: _search,
              onChanged: (v) => setState(() => _search = v),
            ),
            const SizedBox(height: AppSpacing.sm),
            FilterChips<_CaseSection>(
              key: const ValueKey('case-sections'),
              value: _section,
              options: [
                (_CaseSection.open, t.t('mine.tab.open')),
                (_CaseSection.inProgress, t.t('mine.tab.inWork')),
                (_CaseSection.completed, t.t('mine.tab.completed')),
                (_CaseSection.archived, t.t('cases.mine.archived')),
              ],
              onChanged: (v) => setState(() => _section = v),
            ),
            const SizedBox(height: AppSpacing.sm),
            Expanded(child: _ClientCasesGrid(filter: filter, search: _search)),
          ],
        ),
    };
    return Column(
      children: [
        PillTabs<_ClientTab>(
          value: _tab,
          tabs: [
            (_ClientTab.planner, t.t('mine.tab.tasks')),
            (_ClientTab.cases, t.t('mine.tab.cases')),
            (_ClientTab.saved, t.t('mine.tab.saved')),
          ],
          onChanged: (v) => setState(() => _tab = v),
        ),
        Expanded(
          child: TabSwipe<_ClientTab>(
            value: _tab,
            values: _ClientTab.values,
            onChanged: (v) => setState(() => _tab = v),
            child: AnimatedSwitcher(
              duration:
                  context.reduceMotion ? Duration.zero : AppMotion.stateChange,
              child: body,
            ),
          ),
        ),
      ],
    );
  }
}

class _ClientCasesGrid extends ConsumerWidget {
  const _ClientCasesGrid({required this.filter, required this.search});

  final MyCasesFilter filter;
  final MineSearch search;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final key = (filter: filter, search: search);
    final value = ref.watch(mineCasesProvider(key));
    final n = ref.read(mineCasesProvider(key).notifier);
    final ids = value.value?.items.map((c) => c.id).join(',') ?? '';
    final seen = ref.watch(seenBidCountsProvider(ids)).value ?? const {};
    final firstOpen = filter == MyCasesFilter.open && search.isEmpty;
    return MinePagedGrid<CaseSummary>(
      value: value,
      onRefresh: n.refresh,
      onLoadMore: n.loadMore,
      onRetryMore: n.retryLoadMore,
      empty: AppEmptyState(
        icon: AppIcons.folderOpenRounded,
        title: firstOpen ? t.t('mine.cases.emptyTitle') : null,
        message: firstOpen
            ? t.t('mine.cases.emptyMessage')
            : mineEmpty(t, search, 'mine.cases.emptyFiltered'),
        action: firstOpen
            ? AppButton(
                label: t.t('mine.cases.create'),
                icon: AppIcons.addRounded,
                height: AppSizes.touchTarget,
                // Audit 2026-10-04: straight to the case form.
                onPressed: () => context.push('${AppRoutes.create}?kind=case'),
              )
            : null,
      ),
      // Owner 2026-10-07 (bug 16): compact rows; swipe left for actions.
      rowOf: (c) => MyCaseRow(
        item: c,
        swipe: true,
        newBids: (c.bidsCount - (seen[c.id] ?? 0)).clamp(0, c.bidsCount),
      ),
    );
  }
}

/// Owner 2026-09-30 — attorney "Mine": My bids, In progress, Completed
/// and Saved, each a searchable, filterable grid of case squares.
class AttorneyMineView extends ConsumerStatefulWidget {
  const AttorneyMineView({super.key});

  @override
  ConsumerState<AttorneyMineView> createState() => _AttorneyMineViewState();
}

class _AttorneyMineViewState extends ConsumerState<AttorneyMineView> {
  _AttorneyTab _tab = _AttorneyTab.planner;
  _BidsSection _section = _BidsSection.active;
  MineSearch _search = const MineSearch();

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final search = Column(
      children: [
        MineSearchBar(
          search: _search,
          onChanged: (v) => setState(() => _search = v),
        ),
        MineActiveFilters(
          search: _search,
          onChanged: (v) => setState(() => _search = v),
        ),
      ],
    );
    final sections = Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: FilterChips<_BidsSection>(
        key: const ValueKey('bids-sections'),
        value: _section,
        options: [
          (_BidsSection.active, t.t('mine.filter.active')),
          (_BidsSection.invites, t.t('invites.section')),
          (_BidsSection.work, t.t('mine.tab.inWork')),
          (_BidsSection.completed, t.t('mine.tab.completed')),
          (_BidsSection.finished, t.t('cases.mine.finished')),
          (_BidsSection.saved, t.t('mine.tab.saved')),
        ],
        onChanged: (v) => setState(() => _section = v),
      ),
    );
    final Widget grid = switch (_section) {
      // Bids waiting for the client.
      _BidsSection.active => _BidsGrid(
          key: const ValueKey('active'),
          filter: MyBidsFilter.active,
          search: _search,
        ),
      // Owner 2026-10-05: cases clients offered to this attorney.
      _BidsSection.invites => const InvitesList(key: ValueKey('invites')),
      // Audit 2026-10-04: declined / withdrawn / expired bids (accepted
      // ones are under In progress).
      _BidsSection.finished => _BidsGrid(
          key: const ValueKey('finished'),
          filter: MyBidsFilter.finished,
          search: _search,
        ),
      _BidsSection.work || _BidsSection.completed => _WorkGrid(
          key: ValueKey(_section.name),
          filter: _section == _BidsSection.work
              ? WorkFilter.active
              : WorkFilter.closed,
          search: _search,
        ),
      _BidsSection.saved => _AttorneySaved(
          key: const ValueKey('saved'),
          search: _search,
          searchBar: const SizedBox.shrink(),
        ),
    };
    final body = switch (_tab) {
      _AttorneyTab.bids => Column(
          key: const ValueKey('bids'),
          children: [
            search,
            sections,
            const SizedBox(height: AppSpacing.sm),
            Expanded(
              child: AnimatedSwitcher(
                duration: context.reduceMotion
                    ? Duration.zero
                    : AppMotion.stateChange,
                child: grid,
              ),
            ),
          ],
        ),
      _AttorneyTab.planner => const TasksTab(key: ValueKey('planner')),
    };
    return Column(
      children: [
        PillTabs<_AttorneyTab>(
          value: _tab,
          tabs: [
            (_AttorneyTab.planner, t.t('mine.tab.tasks')),
            (_AttorneyTab.bids, t.t('mine.tab.myBids')),
          ],
          onChanged: (v) => setState(() => _tab = v),
        ),
        Expanded(
          child: TabSwipe<_AttorneyTab>(
            value: _tab,
            values: _AttorneyTab.values,
            onChanged: (v) => setState(() => _tab = v),
            child: AnimatedSwitcher(
              duration:
                  context.reduceMotion ? Duration.zero : AppMotion.stateChange,
              child: body,
            ),
          ),
        ),
      ],
    );
  }
}

class _BidsGrid extends ConsumerWidget {
  const _BidsGrid({required this.filter, required this.search, super.key});

  final MyBidsFilter filter;
  final MineSearch search;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final key = (filter: filter, search: search);
    final value = ref.watch(mineBidsProvider(key));
    final n = ref.read(mineBidsProvider(key).notifier);
    return MinePagedGrid<MyBid>(
      value: value,
      onRefresh: n.refresh,
      onLoadMore: n.loadMore,
      onRetryMore: n.retryLoadMore,
      empty: AppEmptyState(
        icon: AppIcons.gavelRounded,
        message: mineEmpty(
          t,
          search,
          filter == MyBidsFilter.active
              ? 'mine.bids.emptyActive'
              : 'mine.bids.emptyFinished',
        ),
        action: filter == MyBidsFilter.active && search.isEmpty
            ? AppButton(
                label: t.t('mine.bids.findCases'),
                height: AppSizes.touchTarget,
                variant: AppButtonVariant.secondary,
                onPressed: () => context.go(AppRoutes.feed),
              )
            : null,
      ),
      tileOf: (b) {
        final (label, tone) = bidStatusOf(t, b.bid, PartyRole.attorney);
        return MineTileData(
          title: b.caseTitle,
          statusLabel: label,
          statusTone: tone,
          coverUrl: b.coverUrl,
          practiceCode: b.casePracticeCode,
          onTap: () => context.push(AppRoutes.bid(b.bid.id)),
        );
      },
    );
  }
}

class _WorkGrid extends ConsumerWidget {
  const _WorkGrid({required this.filter, required this.search, super.key});

  final WorkFilter filter;
  final MineSearch search;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final key = (filter: filter, search: search);
    final value = ref.watch(mineWorkProvider(key));
    final n = ref.read(mineWorkProvider(key).notifier);
    return MinePagedGrid<WorkItem>(
      value: value,
      onRefresh: n.refresh,
      onLoadMore: n.loadMore,
      onRetryMore: n.retryLoadMore,
      empty: AppEmptyState(
        icon: filter == WorkFilter.active
            ? AppIcons.workOutlineRounded
            : AppIcons.historyRounded,
        message: mineEmpty(
          t,
          search,
          filter == WorkFilter.active
              ? 'mine.work.empty'
              : 'mine.work.completedEmpty',
        ),
      ),
      tileOf: (w) => MineTileData(
        title: w.title,
        statusLabel: caseStatusLabel(t, w.status),
        statusTone: caseTone(w.status),
        coverUrl: w.coverUrl,
        practiceCode: w.practiceCode,
        onTap: () => context.push(AppRoutes.workCase(w.caseId)),
      ),
    );
  }
}

enum _SavedKind { cases, posts }

/// "Saved" for attorneys: saved cases (a grid, searchable) and posts.
class _AttorneySaved extends ConsumerStatefulWidget {
  const _AttorneySaved({
    required this.search,
    required this.searchBar,
    super.key,
  });

  final MineSearch search;
  final Widget searchBar;

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
        if (_kind == _SavedKind.cases) widget.searchBar,
        const SizedBox(height: AppSpacing.sm),
        FilterChips<_SavedKind>(
          value: _kind,
          options: [
            (_SavedKind.cases, t.t('mine.saved.cases')),
            (_SavedKind.posts, t.t('mine.saved.posts')),
          ],
          onChanged: (v) => setState(() => _kind = v),
        ),
        const SizedBox(height: AppSpacing.sm),
        Expanded(
          child: _kind == _SavedKind.cases
              ? _SavedGrid(search: widget.search)
              : const SavedPostsList(),
        ),
      ],
    );
  }
}

class _SavedGrid extends ConsumerWidget {
  const _SavedGrid({required this.search});

  final MineSearch search;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final value = ref.watch(mineSavedProvider(search));
    final n = ref.read(mineSavedProvider(search).notifier);
    return MinePagedGrid<SavedCase>(
      value: value,
      onRefresh: n.refresh,
      onLoadMore: n.loadMore,
      onRetryMore: n.retryLoadMore,
      empty: AppEmptyState(
        icon: AppIcons.bookmarkOutlineRounded,
        message: mineEmpty(t, search, 'mine.saved.empty'),
      ),
      tileOf: (sv) {
        final card = sv.card;
        final ok = sv.available && card != null;
        return MineTileData(
          title: card?.title ?? sv.title ?? '—',
          statusLabel: ok
              ? caseStatusLabel(t, card.status)
              : t.t('mine.saved.unavailable'),
          statusTone: ok ? caseTone(card.status) : StatusTone.neutral,
          practiceCode: card?.practice.code,
          categoryCode: card?.practice.categoryCode,
          onTap: ok
              ? () => context.push(AppRoutes.caseDetail(sv.caseId))
              : () async {
                  await ref
                      .read(caseActionsProvider)
                      .setSaved(sv.caseId, saved: false);
                  n.removeWhere((x) => x.caseId == sv.caseId);
                },
        );
      },
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
          icon: AppIcons.historyRounded,
          message: t.t('mine.work.completedEmpty'),
        ),
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
