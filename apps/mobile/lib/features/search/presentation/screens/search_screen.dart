import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/data/cases_repository.dart'
    show CaseFeedExtras;
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/contacts_sync/presentation/contacts_section.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:lawbid/features/feed/presentation/widgets/feed_chrome.dart';
import 'package:lawbid/features/feed/presentation/widgets/topic_filter_bar.dart'
    show topicName;
import 'package:lawbid/features/search/application/search_providers.dart';
import 'package:lawbid/features/search/data/search_repository.dart';
import 'package:lawbid/features/search/presentation/widgets/flip_search_bar.dart';
import 'package:lawbid/features/search/presentation/widgets/search_filters_sheet.dart';
import 'package:lawbid/features/search/presentation/widgets/search_tiles.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

enum SearchTab { attorneys, cases, posts, tags }

/// docs/05 §7 Search tab: one query for all result tabs (clients:
/// Attorneys / Posts / Topics; attorneys: People / Cases / Posts /
/// Topics), 2+ characters, 300 ms debounce, filters in a sheet, and
/// before typing: recent searches, popular topics, suggested attorneys.
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  static const _debounce = Duration(milliseconds: 300);

  final _controller = TextEditingController();
  final _focus = FocusNode();

  /// Owner 2026-10-13: the field leaves on a scroll down and returns on a
  /// scroll up, like the feed's filters; the section tabs stay.
  final _chrome = FeedChromeController();
  Timer? _timer;
  Timer? _suggestTimer;

  /// What is typed now (for the type-ahead row), after a short pause.
  String _suggestQ = '';
  String _query = '';
  bool _focused = false;
  SearchTab _tab = SearchTab.attorneys;

  /// OQ-036: every tab keeps its own filters.
  final Map<SearchTab, SearchFilters> _filters = {};

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onText);
    _focus.addListener(_onFocus);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _suggestTimer?.cancel();
    _chrome.dispose();
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  /// Magnifier inside the field: submits the current text at once.
  void _onMagnifier() {
    _timer?.cancel();
    final next = normalizeSearch(_controller.text);
    if (next.length >= kSearchMinChars) {
      setState(() => _query = next);
      ref.read(recentSearchesProvider.notifier).remember(next);
    }
    if (_focused) setState(() => _focused = false);
    _focus.unfocus();
  }

  /// One request per pause in typing, never per keystroke (§7.1).
  void _onText() {
    _timer?.cancel();
    final next = normalizeSearch(_controller.text);
    // Owner 2026-10-15: type-ahead suggestions after a 150 ms pause.
    _suggestTimer?.cancel();
    _suggestTimer = Timer(const Duration(milliseconds: 150), () {
      if (mounted && next != _suggestQ) setState(() => _suggestQ = next);
    });
    if (next.length < kSearchMinChars) {
      if (_query.isNotEmpty) setState(() => _query = '');
      return;
    }
    _timer = Timer(_debounce, () {
      if (mounted && next != _query) setState(() => _query = next);
    });
  }

  /// Leaving the field with a real query counts as "searched" (§7.2).
  void _onFocus() {
    // The history stays open after the keyboard is dragged away; it
    // closes on a pick, a search or a tab change.
    if (_focus.hasFocus && !_focused) setState(() => _focused = true);
    if (_focus.hasFocus) _chrome.show();
    if (!_focus.hasFocus && _query.isNotEmpty) {
      ref.read(recentSearchesProvider.notifier).remember(_query);
    }
  }

  void _useRecent(String q) {
    _controller
      ..text = q
      ..selection = TextSelection.collapsed(offset: q.length);
    _timer?.cancel();
    setState(() {
      _query = normalizeSearch(q);
      _focused = false;
    });
  }

  Future<void> _openFilters(SearchFilterKind kind) async {
    final picked = await showSearchFilters(
      context,
      initial: _filters[_tab] ?? const SearchFilters(),
      kind: kind,
    );
    if (picked == null || !mounted) return;
    setState(() => _filters[_tab] = picked);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final attorney = ref.watch(actsAsAttorneyProvider);
    // OQ-026: People (attorneys and clients) for both roles.
    final tabs = [
      (SearchTab.attorneys, t.t('search.tab.people')),
      // Owner 2026-09-30: cases are searched by attorneys only; a client
      // sees their own cases in "Mine".
      if (attorney) (SearchTab.cases, t.t('search.tab.cases')),
      (SearchTab.posts, t.t('search.tab.posts')),
      (SearchTab.tags, t.t('search.tab.tags')),
    ];
    if (!tabs.any((x) => x.$1 == _tab)) _tab = SearchTab.attorneys;
    final filters = _filters[_tab] ?? const SearchFilters();
    final kind = switch (_tab) {
      SearchTab.attorneys => SearchFilterKind.people,
      SearchTab.cases =>
        attorney ? SearchFilterKind.cases : SearchFilterKind.myCases,
      SearchTab.posts => SearchFilterKind.posts,
      SearchTab.tags => SearchFilterKind.topics,
    };

    final tabsRow = PillTabs<SearchTab>(
      value: _tab,
      tabs: tabs,
      onChanged: (v) => setState(() {
        _tab = v;
        _focused = false;
      }),
    );

    // Filters button inside the field at the left edge (owner
    // 2026-09-29). Dimmed on tabs that have no filters yet.
    final filterButton = Badge(
      isLabelVisible: filters.activeCount > 0,
      label: Text('${filters.activeCount}'),
      backgroundColor: colors.gold,
      textColor: colors.navy,
      child: AppIconButton(
        icon: AppIcon(AppIcons.tuneRounded, color: colors.text),
        semanticLabel: t.t('search.filters'),
        onPressed: () => _openFilters(kind),
      ),
    );

    // Owner 2026-09-29 (2nd pass): a big Instagram-like field at the top,
    // the sections (People / Cases / Posts / Topics) right under it.
    final field = FlipSearchBar(
      controller: _controller,
      focusNode: _focus,
      semanticLabel: t.t('search.field'),
      cancelLabel: t.t('common.cancel'),
      clearLabel: t.t('search.clear'),
      showCancel: false,
      height: 40,
      leading: filterButton,
      // Owner 2026-10-13: the field never shrinks. While the history is
      // open and nothing is typed, the icon at its end is a × = cancel
      // (hides the keyboard and the history); once there is text it is the
      // magnifier that searches.
      trailing: ValueListenableBuilder<TextEditingValue>(
        valueListenable: _controller,
        builder: (context, value, _) {
          final cancel = _focused && value.text.isEmpty;
          return AppIconButton(
            icon: AppIcon(
              cancel ? AppIcons.closeRounded : AppIcons.searchRounded,
              color: cancel ? colors.textSecondary : colors.goldDark,
            ),
            semanticLabel: cancel ? t.t('common.cancel') : t.t('search.open'),
            onPressed: cancel
                ? () {
                    _focus.unfocus();
                    setState(() => _focused = false);
                  }
                : (value.text.isEmpty ? _focus.requestFocus : _onMagnifier),
          );
        },
      ),
      // Owner 2026-10-14: the hint matches the tab it searches.
      hints: switch (_tab) {
        SearchTab.attorneys => [
            t.t(attorney ? 'search.hint.attorney' : 'search.hint.client'),
            t.t('search.hint.username'),
          ],
        SearchTab.cases => [t.t('search.hint.cases')],
        SearchTab.posts => [t.t('search.hint.posts')],
        SearchTab.tags => [t.t('search.hint.tag')],
      },
      onSubmitted: (v) => ref.read(recentSearchesProvider.notifier).remember(v),
    );

    return PopScope(
      canPop: !_focused,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _focused) {
          _focus.unfocus();
          setState(() => _focused = false);
        }
      },
      child: Scaffold(
        backgroundColor: colors.bg,
        body: FeedChrome(
          controller: _chrome,
          child: SafeArea(
            bottom: false,
            child: Column(
              children: [
                // Owner 2026-09-30: the sections on top, the field under them.
                tabsRow,
                ChromeCollapse(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.screenSide,
                      AppSpacing.xs,
                      AppSpacing.screenSide,
                      AppSpacing.xs,
                    ),
                    child: field,
                  ),
                ),
                if (_focused && _suggestQ.isNotEmpty)
                  _SuggestionRow(
                    key: ValueKey('suggest:$_suggestQ'),
                    query: _suggestQ,
                    onPick: _useRecent,
                  ),
                Expanded(
                  child: NotificationListener<ScrollNotification>(
                    onNotification: _chrome.onScroll,
                    child: TabSwipe<SearchTab>(
                      value: _tab,
                      values: [for (final (v, _) in tabs) v],
                      onChanged: (v) => setState(() => _tab = v),
                      child: AnimatedSwitcher(
                        duration: context.reduceMotion
                            ? Duration.zero
                            : AppMotion.stateChange,
                        child: _query.isEmpty && _focused
                            // Instagram: tapping the field shows the history
                            // right under it, each line with a × and "Clear".
                            ? _RecentHistory(
                                key: const ValueKey('history'),
                                onPick: _useRecent,
                              )
                            : _query.isEmpty
                                ? _BeforeTyping(
                                    key: ValueKey(
                                      'idle:$_tab:${filters.hashCode}',
                                    ),
                                    tab: _tab,
                                    filters: filters,
                                    onFilters: (f) =>
                                        setState(() => _filters[_tab] = f),
                                    onRecent: _useRecent,
                                  )
                                : KeyedSubtree(
                                    key: ValueKey(
                                      '$_tab:$_query:${filters.hashCode}',
                                    ),
                                    child: _Results(
                                      tab: _tab,
                                      query: _query,
                                      filters: filters,
                                      onFilters: (f) =>
                                          setState(() => _filters[_tab] = f),
                                    ),
                                  ),
                      ),
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

class _Results extends ConsumerWidget {
  const _Results({
    required this.tab,
    required this.query,
    required this.filters,
    required this.onFilters,
  });

  final SearchTab tab;
  final String query;
  final SearchFilters filters;
  final ValueChanged<SearchFilters> onFilters;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final attorney = ref.watch(actsAsAttorneyProvider);
    final nothing = AppEmptyState(
      icon: AppIcons.searchOffRounded,
      title: t.t('search.empty.title'),
      message: t.t('search.empty.message', {'query': query}),
    );
    final key = (q: query, filters: filters);
    switch (tab) {
      case SearchTab.attorneys:
        final n = ref.read(peopleSearchProvider(key).notifier);
        return PagedListBody<PersonRow>(
          value: ref.watch(peopleSearchProvider(key)),
          t: t,
          itemKey: (r) => r.id,
          itemBuilder: (context, r, _) => PersonTile(row: r),
          // The row carries its own side padding (same as Suggested).
          edgeToEdge: true,
          empty: nothing,
          onRefresh: n.refresh,
          onLoadMore: n.loadMore,
          onRetryMore: n.retryLoadMore,
        );
      case SearchTab.cases when !attorney:
        return _MyCasesGrid(query: query, filters: filters, empty: nothing);
      case SearchTab.cases:
        final n = ref.read(caseSearchProvider(key).notifier);
        return PagedTileGrid<FeedCase>(
          value: ref.watch(caseSearchProvider(key)),
          itemBuilder: (c) => SearchCaseTile(item: c),
          rows: true,
          empty: nothing,
          onRefresh: n.refresh,
          onLoadMore: n.loadMore,
        );
      case SearchTab.posts:
        final n = ref.read(postSearchProvider(key).notifier);
        return PagedTileGrid<Post>(
          value: ref.watch(postSearchProvider(key)),
          itemBuilder: (p) => SearchPostTile(
            post: p,
            feed: ref.read(postSearchProvider(key)).value?.items,
          ),
          empty: nothing,
          onRefresh: n.refresh,
          onLoadMore: n.loadMore,
        );
      case SearchTab.tags:
        // Practices whose name matches come first, then hashtags.
        final lower = query.toLowerCase().replaceAll('#', '');
        final practices = filters.topicKind == TopicKind.hashtags
            ? const <String>[]
            : _sortedPractices(ref, filters, [
                for (final c in kPracticeCategoryCodes)
                  if ((kPracticeCategoryNamesEn[c] ?? c)
                          .toLowerCase()
                          .contains(lower) ||
                      topicTagFor(c).contains(lower))
                    c,
              ]);
        return AsyncDetailBody<List<TagInfo>>(
          value: ref.watch(tagSearchProvider(query)),
          t: t,
          onRetry: () => ref.invalidate(tagSearchProvider(query)),
          builder: (tags) => tags.isEmpty && practices.isEmpty
              ? nothing
              : ListView(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                  children: [
                    for (final c in practices) _PracticeTopicRow(code: c),
                    if (filters.topicKind != TopicKind.practices)
                      for (final tag in _sortedTags(filters, tags))
                        if (!practices.contains(categoryForTopicTag(tag.tag)))
                          _TagTopicRow(tag: tag),
                  ],
                ),
        );
    }
  }
}

/// A practice as a topic: our photo, its name, "#tag".
class _PracticeTopicRow extends ConsumerWidget {
  const _PracticeTopicRow({required this.code});

  final String code;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return TopicRow(
      tag: topicTagFor(code),
      categoryCode: code,
      title: topicName(ref, code),
      subtitle: t.t('search.topics.practiceSub', {'tag': topicTagFor(code)}),
    );
  }
}

/// Any hashtag: its practice photo when it maps to one, and the count.
class _TagTopicRow extends ConsumerWidget {
  const _TagTopicRow({required this.tag});

  final TagInfo tag;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    // Owner 2026-10-15: a topic without its own name-based category takes
    // the practice its posts mostly belong to — never a grey square.
    final named = topicCategory(tag.tag);
    final cat = named ?? tag.categoryCode;
    final count = tag.postsCount;
    return TopicRow(
      tag: tag.tag,
      categoryCode: cat,
      title: cat == null ? '#${tag.tag}' : topicName(ref, cat),
      subtitle: count == null
          ? '#${tag.tag}'
          : '#${tag.tag} · ${t.t('search.topics.posts', {
                  'count': SocialFormat.count(f, count),
                })}',
    );
  }
}

/// Owner 2026-09-30: before typing, every tab shows the recent searches,
/// "Based on your search «…»" (this tab's results for the latest one) and
/// its own explore content — people, a grid of cases or posts, topics.
class _BeforeTyping extends ConsumerWidget {
  const _BeforeTyping({
    required this.tab,
    required this.filters,
    required this.onFilters,
    required this.onRecent,
    super.key,
  });

  final ValueChanged<SearchFilters> onFilters;

  final SearchTab tab;

  /// OQ-036: this tab's filters also shape its suggestions.
  final SearchFilters filters;
  final ValueChanged<String> onRecent;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    // Owner 2026-10-13: the Posts tab is only the grid — no recent searches,
    // no "based on" rows, no section titles.
    final postsTab = tab == SearchTab.posts;
    final recent = postsTab
        ? const <String>[]
        : ref.watch(recentSearchesProvider).value ?? const [];
    final last = recent.isEmpty ? null : recent.first;
    final attorney = ref.watch(actsAsAttorneyProvider);

    Widget title(String text, {Widget? trailing, bool small = false}) =>
        Padding(
          padding: EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            small ? AppSpacing.md : AppSpacing.lg,
            AppSpacing.sm,
            small ? AppSpacing.xs : AppSpacing.sm,
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  text,
                  maxLines: small ? 1 : null,
                  overflow: small ? TextOverflow.ellipsis : null,
                  style: small
                      ? type.body.copyWith(
                          color: colors.text,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        )
                      : type.titleMedium.copyWith(color: colors.text),
                ),
              ),
              if (trailing != null)
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 160),
                  child: trailing,
                ),
            ],
          ),
        );

    // Owner 2026-10-07 (bug 16): posts as the profile grid, cases as
    // compact rows.
    Widget grid<T>(List<T> items, Widget Function(T) build) =>
        SliverGrid.builder(
          gridDelegate: kSearchPostGridDelegate,
          itemCount: items.length,
          itemBuilder: (context, i) => build(items[i]),
        );
    Widget rows<T>(List<T> items, Widget Function(T) build) => SliverPadding(
          padding: kSearchRowsPadding,
          sliver: SliverList.separated(
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(height: kSearchRowGap),
            itemBuilder: (context, i) => build(items[i]),
          ),
        );

    final lastKey = last == null ? null : (q: last, filters: filters);

    // "Based on your search" for this tab.
    // ignore: omit_local_variable_types
    // Owner 2026-10-14: no "Show more" button — the next page loads by
    // itself when the list is scrolled near its end.
    final loaders = <VoidCallback>[];
    Widget more({required bool hasMore, required VoidCallback onMore}) {
      if (hasMore) loaders.add(onMore);
      return SliverToBoxAdapter(
        child: hasMore
            ? const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
                child: Center(
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              )
            : const SizedBox.shrink(),
      );
    }

    // ignore: omit_local_variable_types
    final List<Widget> basedOn = switch (tab) {
      _ when last == null => const [],
      SearchTab.attorneys => [
          for (final r
              in (ref.watch(peopleSearchProvider(lastKey!)).value?.items ??
                      const <PersonRow>[])
                  .take(10))
            SliverToBoxAdapter(child: PersonTile(row: r)),
        ],
      SearchTab.cases when !attorney => [
          rows<CaseSummary>(
            _myCases(ref, last, filters).take(4).toList(),
            (c) => SearchMyCaseTile(item: c),
          ),
        ],
      SearchTab.cases => [
          rows<FeedCase>(
            (ref.watch(caseSearchProvider(lastKey!)).value?.items ??
                    const <FeedCase>[])
                .take(4)
                .toList(),
            (c) => SearchCaseTile(item: c),
          ),
        ],
      SearchTab.posts => [
          grid<Post>(
            (ref.watch(postSearchProvider(lastKey!)).value?.items ??
                    const <Post>[])
                .take(6)
                .toList(),
            (p) => SearchPostTile(
              post: p,
              feed: ref.read(postSearchProvider(lastKey)).value?.items,
            ),
          ),
        ],
      SearchTab.tags => [
          for (final tag
              in (ref.watch(tagSearchProvider(last)).value ?? const <TagInfo>[])
                  .take(3))
            SliverToBoxAdapter(child: _TagTopicRow(tag: tag)),
        ],
    };

    // ignore: omit_local_variable_types
    final List<Widget> explore = switch (tab) {
      SearchTab.attorneys => [
          const SliverToBoxAdapter(child: ContactsSection()),
          const SliverToBoxAdapter(child: RecommendedAttorneys()),
        ],
      SearchTab.cases when !attorney => [
          SliverToBoxAdapter(child: title(t.t('search.tab.myCases'))),
          rows<CaseSummary>(
            _myCases(ref, '', filters),
            (c) => SearchMyCaseTile(item: c),
          ),
        ],
      // Audit 2026-10-01: explore grids filtered on the server (every
      // filter, every page), with "Show more".
      SearchTab.cases => [
          SliverToBoxAdapter(child: title(t.t('search.section.cases'))),
          rows<FeedCase>(
            ref.watch(exploreCasesProvider(_casesKey(filters))).value?.items ??
                const <FeedCase>[],
            (c) => SearchCaseTile(item: c),
          ),
          more(
            hasMore: ref
                    .watch(exploreCasesProvider(_casesKey(filters)))
                    .value
                    ?.nextCursor !=
                null,
            onMore: () => ref
                .read(exploreCasesProvider(_casesKey(filters)).notifier)
                .loadMore(),
          ),
        ],
      SearchTab.posts => [
          grid<Post>(
            ref.watch(explorePostsProvider(_postsKey(filters))).value?.items ??
                const <Post>[],
            (p) => SearchPostTile(
              post: p,
              feed: ref
                  .read(explorePostsProvider(_postsKey(filters)))
                  .value
                  ?.items,
            ),
          ),
          more(
            hasMore: ref
                    .watch(explorePostsProvider(_postsKey(filters)))
                    .value
                    ?.nextCursor !=
                null,
            onMore: () => ref
                .read(explorePostsProvider(_postsKey(filters)).notifier)
                .loadMore(),
          ),
        ],
      SearchTab.tags => [
          // Owner 2026-10-15: no explanation line under the field.
          if (filters.topicKind != TopicKind.practices)
            ...switch (ref.watch(trendingTagsProvider)) {
              AsyncData(:final value) when value.isNotEmpty => [
                  SliverToBoxAdapter(child: title(t.t('search.trending'))),
                  for (final tag in _sortedTags(filters, value).take(8))
                    SliverToBoxAdapter(child: _TagTopicRow(tag: tag)),
                ],
              _ => const <Widget>[],
            },
          if (filters.topicKind != TopicKind.hashtags) ...[
            SliverToBoxAdapter(child: title(t.t('search.topics.practices'))),
            for (final c
                in _sortedPractices(ref, filters, kPracticeCategoryCodes))
              SliverToBoxAdapter(child: _PracticeTopicRow(code: c)),
          ],
        ],
    };

    return RefreshIndicator(
      color: colors.gold,
      onRefresh: () async {
        // What this screen shows: the explore grids, topics, suggested
        // lawyers, my cases and the "based on your last search" rows.
        ref
          ..invalidate(trendingTagsProvider)
          ..invalidate(exploreCasesProvider)
          ..invalidate(explorePostsProvider)
          ..invalidate(suggestionsProvider)
          ..invalidate(myCasesProvider)
          ..invalidate(peopleSearchProvider)
          ..invalidate(caseSearchProvider)
          ..invalidate(postSearchProvider)
          ..invalidate(tagSearchProvider);
      },
      child: NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.metrics.extentAfter < 400) {
            for (final load in loaders) {
              load();
            }
          }
          return false;
        },
        child: CustomScrollView(
          slivers: [
            ...explore,
            if (basedOn.isNotEmpty) ...[
              SliverToBoxAdapter(
                child: title(
                  t.t('search.section.basedOn', {'q': last!}),
                  small: true,
                ),
              ),
              ...basedOn,
            ],
            const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xxl)),
          ],
        ),
      ),
    );
  }
}

/// A client's own cases matching [query] (title or practice) and the
/// "My cases" filters (status, practice area); '' = all.
List<CaseSummary> _myCases(WidgetRef ref, String query, SearchFilters f) {
  final q = query.toLowerCase();
  final statuses = f.caseStatus == null
      ? const [
          MyCasesFilter.active,
          MyCasesFilter.archived,
          MyCasesFilter.closed,
        ]
      : [f.caseStatus!];
  final all = [
    for (final s in statuses) ...?ref.watch(myCasesProvider(s)).value?.items,
  ];
  return [
    for (final c in all)
      if ((q.isEmpty ||
              c.title.toLowerCase().contains(q) ||
              c.practice.nameEn.toLowerCase().contains(q) ||
              (c.practice.categoryNameEn ?? '').toLowerCase().contains(q)) &&
          (f.practiceCategory == null ||
              c.practice.artCode == f.practiceCategory))
        c,
  ];
}

String? _periodWire(SearchPeriod p) => switch (p) {
      SearchPeriod.day => '24h',
      SearchPeriod.week => '7d',
      SearchPeriod.month => '30d',
      SearchPeriod.all => null,
    };

/// Audit 2026-10-01: every Cases filter goes to the server.
ExploreCasesKey _casesKey(SearchFilters f) => (
      practiceCategory: f.practiceCategory,
      state: f.state,
      extras: CaseFeedExtras(
        period: _periodWire(f.period),
        budgetMin: f.budgetMin,
        budgetMax: f.budgetMax,
        budgetUnknown: f.budgetUnknown,
        noBids: f.noBids,
        minUrgency: f.minUrgency,
        hasDeadline: f.hasDeadline,
        // Owner 2026-10-13: cases ranked for this attorney.
        forYou: true,
      ),
    );

/// Audit 2026-10-01: every Posts filter goes to the server.
ExplorePostsKey _postsKey(SearchFilters f) => (
      state: f.state,
      practice: f.practiceCategory,
      period: _periodWire(f.period),
      withPhotos: f.withPhotos,
      briefsOnly: f.briefsOnly,
      popular: f.postSort == PostSort.popular,
      // Owner 2026-10-13: the grid is ranked for me unless a sort is picked.
      forYou: f.postSort == PostSort.relevance,
    );

/// "Show more" under an explore grid.
List<String> _sortedPractices(
  WidgetRef ref,
  SearchFilters f,
  List<String> codes,
) {
  if (f.topicSort != TopicSort.az) return codes;
  return [...codes]
    ..sort((a, b) => topicName(ref, a).compareTo(topicName(ref, b)));
}

List<TagInfo> _sortedTags(SearchFilters f, List<TagInfo> tags) {
  if (f.topicSort != TopicSort.az) return tags;
  return [...tags]..sort((a, b) => a.tag.compareTo(b.tag));
}

class _MyCasesGrid extends ConsumerWidget {
  const _MyCasesGrid({
    required this.query,
    required this.filters,
    required this.empty,
  });

  final String query;
  final SearchFilters filters;
  final Widget empty;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = _myCases(ref, query, filters);
    if (items.isEmpty) return empty;
    return ListView.separated(
      padding: kSearchRowsPadding,
      itemCount: items.length,
      separatorBuilder: (_, __) => const SizedBox(height: kSearchRowGap),
      itemBuilder: (context, i) => SearchMyCaseTile(item: items[i]),
    );
  }
}

/// The search history inside the field's own list (shown while the field
/// has focus and is empty): "Recent" with "Clear", and a × on every line.
class _RecentHistory extends ConsumerWidget {
  const _RecentHistory({required this.onPick, super.key});

  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final recent = ref.watch(recentSearchesProvider).value ?? const <String>[];
    if (recent.isEmpty) return const SizedBox.shrink();
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.sm,
            AppSpacing.xs,
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  t.t('search.recent'),
                  style: type.body.copyWith(
                    color: colors.text,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              GestureDetector(
                onTap: () => ref.read(recentSearchesProvider.notifier).clear(),
                behavior: HitTestBehavior.opaque,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm,
                    vertical: AppSpacing.xs,
                  ),
                  child: Text(
                    t.t('search.recent.clear'),
                    style: type.body.copyWith(
                      color: colors.gold,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        for (final q in recent)
          InkWell(
            onTap: () => onPick(q),
            child: Padding(
              padding: const EdgeInsets.only(
                left: AppSpacing.screenSide,
                right: AppSpacing.xs,
              ),
              child: Row(
                children: [
                  AppIcon(
                    AppIcons.historyRounded,
                    size: 18,
                    color: colors.textSecondary,
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Text(
                      q,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(color: colors.text),
                    ),
                  ),
                  IconButton(
                    tooltip: t.t('search.recent.clear'),
                    visualDensity: VisualDensity.compact,
                    onPressed: () =>
                        ref.read(recentSearchesProvider.notifier).forget(q),
                    icon: AppIcon(
                      AppIcons.closeRounded,
                      size: 18,
                      color: colors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// Owner 2026-10-15: while typing, a slim row of what the server can finish
/// the word with — topics (#), attorney handles (@) and practices; a tap
/// searches for it.
class _SuggestionRow extends ConsumerWidget {
  const _SuggestionRow({required this.query, required this.onPick, super.key});

  final String query;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final items = ref.watch(searchSuggestionsProvider(query)).value ??
        const <SearchSuggestion>[];
    if (items.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (context, i) {
          final s = items[i];
          final label = switch (s.kind) {
            SuggestionKind.tag => '#${s.text}',
            SuggestionKind.person => '@${s.text}',
            SuggestionKind.practice => s.text,
          };
          return Center(
            child: GestureDetector(
              onTap: () => onPick(s.text),
              behavior: HitTestBehavior.opaque,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                  vertical: AppSpacing.xs,
                ),
                decoration: BoxDecoration(
                  color: colors.chip,
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                ),
                child: Text(
                  label,
                  maxLines: 1,
                  style: type.bodySmall.copyWith(color: colors.text),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
