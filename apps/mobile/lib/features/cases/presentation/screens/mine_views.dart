import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/active_case_cards.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/invites_list.dart';
import 'package:lawbid/features/cases/presentation/widgets/my_case_row.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/cases/tools/running_timer_chip.dart';
import 'package:lawbid/features/chat/presentation/saved_chats_view.dart';
import 'package:lawbid/features/deadlines/presentation/deadline_entry.dart';
import 'package:lawbid/features/feed/presentation/widgets/feed_chrome.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_feed_screen.dart'
    deferred as d_qa_feed;
import 'package:lawbid/features/mine/presentation/widgets/mine_grid.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/team/presentation/tasks_tab.dart';

// Owner 2026-10-15: two tabs per role. Client: Cases (Active · Completed
// inside) · Tasks; the client's Saved moved to Settings.
enum _ClientTab { cases, planner, qa }

enum _CaseSection { active, completed }

// Attorney: Cases (Active · Bids · Completed inside, Saved behind the
// bookmark right of the search) · Tasks. «Bids» holds Waiting and
// Invitations.
enum _AttorneyTab { cases, planner, qa }

enum _BidsSection { active, bids, completed }

enum _BidKind { waiting, invites }

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
  _ClientTab _tab = _ClientTab.cases;
  _CaseSection _section = _CaseSection.active;
  MineSearch _search = const MineSearch();
  final _chrome = FeedChromeController(revealOnUp: true);

  @override
  void dispose() {
    _chrome.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    // Owner 2026-10-23: «Вопросы» is the third tab (while `legal_qa` is on).
    final qa = ref.watch(legalQaEnabledProvider);
    Widget pageFor(_ClientTab tab) => switch (tab) {
          // Owner 2026-10-01: clients keep a planner too (own tasks + steps).
          _ClientTab.planner => const TasksTab(key: ValueKey('planner')),
          _ClientTab.qa => const _QaTabPage(),
          _ClientTab.cases => Column(
              key: const ValueKey('cases'),
              children: [
                // Owner 2026-10-15: search and chips go away on scroll down and
                // come back on scroll up.
                ChromeCollapse(
                  child: Column(
                    children: [
                      // Owner 2026-10-16: the chips and the search share a row.
                      MineChipsSearchRow(
                        search: _search,
                        onChanged: (v) => setState(() => _search = v),
                        chips: FilterChips<_CaseSection>(
                          key: const ValueKey('case-sections'),
                          compact: true,
                          padding: EdgeInsets.zero,
                          value: _section,
                          options: [
                            (_CaseSection.active, t.t('mine.filter.active')),
                            (_CaseSection.completed, t.t('mine.chip.done')),
                          ],
                          onChanged: (v) => setState(() => _section = v),
                        ),
                      ),
                      MineActiveFilters(
                        search: _search,
                        onChanged: (v) => setState(() => _search = v),
                      ),
                      const DeadlineMineEntry(),
                      const SizedBox(height: AppSpacing.sm),
                    ],
                  ),
                ),
                Expanded(
                  // Owner 2026-10-22: Active | Completed swipe like the tabs.
                  child: SwipePages<_CaseSection>(
                    value: _section,
                    values: _CaseSection.values,
                    onChanged: (v) => setState(() => _section = v),
                    pageBuilder: (_, section) {
                      final isActive = section == _CaseSection.active;
                      return _ClientCasesGrid(
                        key: ValueKey(section),
                        // Owner 2026-10-15: «Active» = open and in work (the
                        // stage scale); «Completed» = closed and archived.
                        filter: isActive
                            ? MyCasesFilter.active
                            : MyCasesFilter.completed,
                        search: _search,
                        cards: true,
                        scale: isActive,
                      );
                    },
                  ),
                ),
              ],
            ),
        };
    return FeedChrome(
      controller: _chrome,
      child: Column(
        children: [
          PillTabs<_ClientTab>(
            value: _tab,
            tabs: [
              (_ClientTab.cases, t.t('mine.tab.cases')),
              (_ClientTab.planner, t.t('mine.tab.tasks')),
              if (qa) (_ClientTab.qa, t.t('mine.tab.qa')),
            ],
            onChanged: (v) => setState(() => _tab = v),
          ),
          Expanded(
            // Owner 2026-10-19 (Instagram): the sections are pages — the
            // next one slides in with the finger, a tap slides to it.
            child: SwipePages<_ClientTab>(
              value: _tab,
              values: [
                for (final v in _ClientTab.values)
                  if (v != _ClientTab.qa || qa) v,
              ],
              onChanged: (v) => setState(() => _tab = v),
              pageBuilder: (_, tab) => pageFor(tab),
            ),
          ),
        ],
      ),
    );
  }
}

/// Owner 2026-10-23: the questions and answers as a tab of the Cases
/// screen (what the «?» opened before). Its code loads the first time.
class _QaTabPage extends StatelessWidget {
  const _QaTabPage();

  @override
  Widget build(BuildContext context) => DeferredScreen(
        id: 'qa_feed_screen',
        load: d_qa_feed.loadLibrary,
        builder: (_) => d_qa_feed.QaFeedBody(
          key: const ValueKey('qa-tab'),
          embedded: true,
        ),
      );
}

class _ClientCasesGrid extends ConsumerWidget {
  const _ClientCasesGrid({
    required this.filter,
    required this.search,
    this.cards = false,
    this.scale = true,
    super.key,
  });

  final MyCasesFilter filter;
  final MineSearch search;

  /// «Active» and «My cases»: cards instead of compact rows.
  final bool cards;

  /// The progress scale on a card («Active» only).
  final bool scale;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final key = (filter: filter, search: search);
    final value = ref.watch(mineCasesProvider(key));
    final n = ref.read(mineCasesProvider(key).notifier);
    final ids = value.value?.items.map((c) => c.id).join(',') ?? '';
    final seen = ref.watch(seenBidCountsProvider(ids)).value ?? const {};
    final firstOpen = filter == MyCasesFilter.active && search.isEmpty;
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
      edgeToEdge: cards,
      rowOf: (c) => cards
          ? ClientActiveCaseCard(
              item: c,
              scale: scale,
              newBids: (c.bidsCount - (seen[c.id] ?? 0)).clamp(0, c.bidsCount),
            )
          : MyCaseRow(
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
  _AttorneyTab _tab = _AttorneyTab.cases;
  _BidsSection _section = _BidsSection.active;
  _BidKind _kind = _BidKind.waiting;
  bool _saved = false;
  _SavedKind _savedKind = _SavedKind.cases;
  MineSearch _search = const MineSearch();
  final _chrome = FeedChromeController(revealOnUp: true);

  @override
  void dispose() {
    _chrome.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final qa = ref.watch(legalQaEnabledProvider);
    final filters = MineActiveFilters(
      search: _search,
      onChanged: (v) => setState(() => _search = v),
    );
    // Owner 2026-10-15: «Saved» is a bookmark right of the search.
    final saved = AppIconButton(
      key: const ValueKey('mine-saved-toggle'),
      compact: true,
      icon: AppIcon(
        _saved ? AppIcons.bookmarkRounded : AppIcons.bookmarkBorderRounded,
        color: _saved ? colors.iconTint : colors.text,
      ),
      semanticLabel: t.t('mine.tab.saved'),
      onPressed: () => setState(() => _saved = !_saved),
    );
    // Owner 2026-10-16: the section chips, the search and «Saved» share one
    // row; the invitations switch stays under it.
    final topRow = MineChipsSearchRow(
      search: _search,
      onChanged: (v) => setState(() => _search = v),
      action: saved,
      hintKey: _saved
          // Owner 2026-10-20: the saved chats have their own caption.
          ? (_savedKind == _SavedKind.chats
              ? 'saved.search'
              : 'mine.search.saved')
          : _section == _BidsSection.active
              ? 'mine.search.hint'
              : 'mine.search.bids',
      chips: _saved
          ? null
          : FilterChips<_BidsSection>(
              key: const ValueKey('bids-sections'),
              compact: true,
              padding: EdgeInsets.zero,
              value: _section,
              options: [
                (_BidsSection.active, t.t('mine.filter.active')),
                (_BidsSection.bids, t.t('mine.bids.title')),
                (_BidsSection.completed, t.t('mine.chip.done')),
              ],
              onChanged: (v) => setState(() => _section = v),
            ),
    );
    // «Bids» holds the bids waiting for the client and the invitations.
    final kinds = !_saved && _section == _BidsSection.bids
        ? Padding(
            padding: const EdgeInsets.only(top: AppSpacing.sm),
            child: FilterChips<_BidKind>(
              key: const ValueKey('bids-kinds'),
              value: _kind,
              options: [
                (_BidKind.waiting, t.t('mine.bids.waiting')),
                (_BidKind.invites, t.t('invites.section')),
              ],
              onChanged: (v) => setState(() => _kind = v),
            ),
          )
        : const SizedBox.shrink();
    Widget gridFor(_BidsSection section) => switch (section) {
          // The cases in work.
          _BidsSection.active => _WorkGrid(
              key: const ValueKey('active'),
              filter: WorkFilter.active,
              search: _search,
              cards: true,
            ),
          // Bids waiting for the client, and the invitations (swipe between).
          _BidsSection.bids => SwipePages<_BidKind>(
              value: _kind,
              values: _BidKind.values,
              onChanged: (v) => setState(() => _kind = v),
              pageBuilder: (_, kind) => kind == _BidKind.invites
                  ? const InvitesList(key: ValueKey('invites'))
                  : _BidsGrid(
                      key: const ValueKey('waiting'),
                      filter: MyBidsFilter.active,
                      search: _search,
                    ),
            ),
          // Chosen and finished, declined, withdrawn, expired — everything
          // that is over.
          _BidsSection.completed => _BidsGrid(
              key: const ValueKey('completed'),
              filter: MyBidsFilter.completed,
              search: _search,
            ),
        };
    // Owner 2026-10-22: Active | Bids | Completed swipe like the tabs.
    final Widget grid = _saved
        ? _AttorneySaved(
            key: const ValueKey('saved'),
            search: _search,
            searchBar: const SizedBox.shrink(),
            kind: _savedKind,
            onKind: (v) => setState(() => _savedKind = v),
          )
        : SwipePages<_BidsSection>(
            value: _section,
            values: _BidsSection.values,
            onChanged: (v) => setState(() => _section = v),
            pageBuilder: (_, section) => gridFor(section),
          );
    Widget pageFor(_AttorneyTab tab) => switch (tab) {
          _AttorneyTab.cases => Column(
              key: const ValueKey('cases'),
              children: [
                // Owner 2026-10-15: the filter chips hide on scroll down and
                // return on scroll up.
                ChromeCollapse(
                  child: Column(
                    children: [
                      topRow,
                      filters,
                      kinds,
                      const DeadlineMineEntry(),
                      const SizedBox(height: AppSpacing.sm),
                    ],
                  ),
                ),
                Expanded(
                  child: AnimatedSwitcher(
                    // Owner 2026-10-19 («мигание»): loading, data and
                    // tab bodies swap at once (Instagram), no cross-fade.
                    duration: Duration.zero,
                    child: grid,
                  ),
                ),
              ],
            ),
          _AttorneyTab.planner => const TasksTab(key: ValueKey('planner')),
          _AttorneyTab.qa => const _QaTabPage(),
        };
    return FeedChrome(
      controller: _chrome,
      child: Column(
        children: [
          const RunningTimerChip(),
          PillTabs<_AttorneyTab>(
            value: _tab,
            tabs: [
              (_AttorneyTab.cases, t.t('mine.tab.cases')),
              (_AttorneyTab.planner, t.t('mine.tab.tasks')),
              if (qa) (_AttorneyTab.qa, t.t('mine.tab.qa')),
            ],
            onChanged: (v) => setState(() => _tab = v),
          ),
          Expanded(
            // Owner 2026-10-19 (Instagram): the sections are pages — the
            // next one slides in with the finger, a tap slides to it.
            child: SwipePages<_AttorneyTab>(
              value: _tab,
              values: [
                for (final v in _AttorneyTab.values)
                  if (v != _AttorneyTab.qa || qa) v,
              ],
              onChanged: (v) => setState(() => _tab = v),
              pageBuilder: (_, tab) => pageFor(tab),
            ),
          ),
        ],
      ),
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
      edgeToEdge: true,
      rowOf: (b) => AttorneyBidCard(item: b),
    );
  }
}

class _WorkGrid extends ConsumerWidget {
  const _WorkGrid({
    required this.filter,
    required this.search,
    this.cards = false,
    super.key,
  });

  final WorkFilter filter;
  final MineSearch search;

  /// «Active»: cards with the progress scale instead of tiles.
  final bool cards;

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
      edgeToEdge: cards,
      rowOf: cards ? (w) => AttorneyActiveCaseCard(item: w) : null,
      tileOf: cards
          ? null
          : (w) => MineTileData(
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

enum _SavedKind { cases, posts, chats }

/// "Saved" for attorneys: saved cases (a grid, searchable) and posts.
class _AttorneySaved extends ConsumerStatefulWidget {
  const _AttorneySaved({
    required this.search,
    required this.searchBar,
    required this.kind,
    required this.onKind,
    super.key,
  });

  final _SavedKind kind;
  final ValueChanged<_SavedKind> onKind;

  final MineSearch search;
  final Widget searchBar;

  @override
  ConsumerState<_AttorneySaved> createState() => _AttorneySavedState();
}

class _AttorneySavedState extends ConsumerState<_AttorneySaved> {
  _SavedKind get _kind => widget.kind;

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
            // Owner 2026-10-20: messages, files and links kept from chats.
            (_SavedKind.chats, t.t('inbox.tab.chats')),
          ],
          onChanged: widget.onKind,
        ),
        const SizedBox(height: AppSpacing.sm),
        // Owner 2026-10-19 (Instagram): cases and posts slide side by side.
        Expanded(
          child: SwipePages<_SavedKind>(
            value: _kind,
            values: _SavedKind.values,
            onChanged: widget.onKind,
            pageBuilder: (_, kind) => switch (kind) {
              _SavedKind.cases => SavedCasesGrid(search: widget.search),
              _SavedKind.posts => const SavedPostsList(),
              _SavedKind.chats => SavedChatsView(query: widget.search.q),
            },
          ),
        ),
      ],
    );
  }
}

/// The attorney's saved cases (a grid). Owner 2026-10-22: also the «Дела»
/// tab of Settings → «Сохранённое».
class SavedCasesGrid extends ConsumerWidget {
  const SavedCasesGrid({this.search = const MineSearch(), super.key});

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
