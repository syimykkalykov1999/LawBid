import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:lawbid/features/feed/presentation/widgets/topic_filter_bar.dart'
    show topicName;
import 'package:lawbid/features/search/presentation/widgets/search_tiles.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/search/application/search_providers.dart';
import 'package:lawbid/features/search/data/search_repository.dart';
import 'package:lawbid/features/search/presentation/widgets/flip_search_bar.dart';
import 'package:lawbid/features/search/presentation/widgets/search_filters_sheet.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/shared/domain/user_role.dart';

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
  Timer? _timer;
  String _query = '';
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
    _focus.unfocus();
  }

  /// One request per pause in typing, never per keystroke (§7.1).
  void _onText() {
    _timer?.cancel();
    final next = normalizeSearch(_controller.text);
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
    if (!_focus.hasFocus && _query.isNotEmpty) {
      ref.read(recentSearchesProvider.notifier).remember(_query);
    }
  }

  void _useRecent(String q) {
    _controller
      ..text = q
      ..selection = TextSelection.collapsed(offset: q.length);
    _timer?.cancel();
    setState(() => _query = normalizeSearch(q));
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
    final attorney = ref.watch(currentUserRoleProvider) == UserRole.attorney;
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
      onChanged: (v) => setState(() => _tab = v),
    );

    // Filters button inside the field at the left edge (owner
    // 2026-09-29). Dimmed on tabs that have no filters yet.
    final filterButton = Badge(
      isLabelVisible: filters.activeCount > 0,
      label: Text('${filters.activeCount}'),
      backgroundColor: colors.gold,
      textColor: colors.navy,
      child: AppIconButton(
        plain: true,
        icon: Icon(Icons.tune_rounded, color: colors.text),
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
      height: AppSizes.searchField,
      leading: filterButton,
      trailing: AppIconButton(
        plain: true,
        icon: Icon(Icons.search_rounded, color: colors.goldDark),
        semanticLabel: t.t('search.open'),
        onPressed: _onMagnifier,
      ),
      hints: [
        t.t(attorney ? 'search.hint.attorney' : 'search.hint.client'),
        t.t('search.hint.username'),
        t.t('search.hint.tag'),
        t.t(attorney ? 'search.hint.cases' : 'search.hint.practice'),
      ],
      onSubmitted: (v) => ref.read(recentSearchesProvider.notifier).remember(v),
    );

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                AppSpacing.md,
                AppSpacing.screenSide,
                0,
              ),
              child: field,
            ),
            tabsRow,
            Expanded(
              child: AnimatedSwitcher(
                duration: context.reduceMotion
                    ? Duration.zero
                    : AppMotion.stateChange,
                child: _query.isEmpty
                    ? _BeforeTyping(
                        key: ValueKey('idle:$_tab:${filters.hashCode}'),
                        tab: _tab,
                        filters: filters,
                        onRecent: _useRecent,
                      )
                    : KeyedSubtree(
                        key: ValueKey('$_tab:$_query:${filters.hashCode}'),
                        child: _Results(
                          tab: _tab,
                          query: _query,
                          filters: filters,
                        ),
                      ),
              ),
            ),
          ],
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
  });

  final SearchTab tab;
  final String query;
  final SearchFilters filters;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final attorney = ref.watch(currentUserRoleProvider) == UserRole.attorney;
    final nothing = AppEmptyState(
      icon: Icons.search_off_rounded,
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
          empty: nothing,
          onRefresh: n.refresh,
          onLoadMore: n.loadMore,
        );
      case SearchTab.posts:
        final n = ref.read(postSearchProvider(key).notifier);
        return PagedTileGrid<Post>(
          value: ref.watch(postSearchProvider(key)),
          itemBuilder: (p) => SearchPostTile(post: p),
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
    final cat = topicCategory(tag.tag);
    final count = tag.postsCount;
    return TopicRow(
      tag: tag.tag,
      categoryCode: cat,
      title: cat == null ? '#${tag.tag}' : topicName(ref, cat),
      subtitle: count == null
          ? '#${tag.tag}'
          : '#${tag.tag} · ${t.t('search.topics.posts', {
                  'count': SocialFormat.count(f, count)
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
    required this.onRecent,
    super.key,
  });

  final SearchTab tab;

  /// OQ-036: this tab's filters also shape its suggestions.
  final SearchFilters filters;
  final ValueChanged<String> onRecent;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final recent = ref.watch(recentSearchesProvider).value ?? const [];
    final last = recent.isEmpty ? null : recent.first;
    final attorney = ref.watch(currentUserRoleProvider) == UserRole.attorney;

    Widget title(String text, {Widget? trailing}) => Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide,
              AppSpacing.lg, AppSpacing.sm, AppSpacing.sm),
          child: Row(
            children: [
              Expanded(
                child: Text(text,
                    style: type.titleMedium.copyWith(color: colors.text)),
              ),
              if (trailing != null) trailing,
            ],
          ),
        );

    SliverPadding grid<T>(List<T> items, Widget Function(T) build) =>
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
          sliver: SliverGrid.builder(
            gridDelegate: kSearchGridDelegate,
            itemCount: items.length,
            itemBuilder: (context, i) => build(items[i]),
          ),
        );

    final lastKey = last == null ? null : (q: last, filters: filters);

    // "Based on your search" for this tab.
    final List<Widget> basedOn = switch (tab) {
      _ when last == null => const [],
      SearchTab.attorneys => [
          for (final r
              in (ref.watch(peopleSearchProvider(lastKey!)).value?.items ??
                      const <PersonRow>[])
                  .take(3))
            SliverToBoxAdapter(child: PersonTile(row: r)),
        ],
      SearchTab.cases when !attorney => [
          grid<CaseSummary>(
            _myCases(ref, last, filters).take(4).toList(),
            (c) => SearchMyCaseTile(item: c),
          ),
        ],
      SearchTab.cases => [
          grid<FeedCase>(
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
                .take(4)
                .toList(),
            (p) => SearchPostTile(post: p),
          ),
        ],
      SearchTab.tags => [
          for (final tag
              in (ref.watch(tagSearchProvider(last)).value ?? const <TagInfo>[])
                  .take(3))
            SliverToBoxAdapter(child: _TagTopicRow(tag: tag)),
        ],
    };

    final List<Widget> explore = switch (tab) {
      SearchTab.attorneys => [
          const SliverToBoxAdapter(child: SuggestedAttorneys(limit: 8)),
        ],
      SearchTab.cases when !attorney => [
          SliverToBoxAdapter(child: title(t.t('search.tab.myCases'))),
          grid<CaseSummary>(
            _myCases(ref, '', filters),
            (c) => SearchMyCaseTile(item: c),
          ),
        ],
      SearchTab.cases => [
          SliverToBoxAdapter(child: title(t.t('search.section.cases'))),
          grid<FeedCase>(
            _filterCases(
              ref
                      .watch(caseFeedProvider((
                        practiceCategory: filters.practiceCategory,
                        state: filters.state,
                      )))
                      .value
                      ?.items ??
                  const <FeedCase>[],
              filters,
            ),
            (c) => SearchCaseTile(item: c),
          ),
        ],
      SearchTab.posts => [
          SliverToBoxAdapter(child: title(t.t('search.section.posts'))),
          grid<Post>(
            _explorePosts(ref, filters),
            (p) => SearchPostTile(post: p),
          ),
        ],
      SearchTab.tags => [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide,
                  AppSpacing.md, AppSpacing.screenSide, 0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline_rounded,
                      size: AppSizes.iconSm, color: colors.goldDark),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(t.t('search.topics.explain'),
                        style: type.bodySmall
                            .copyWith(color: colors.textSecondary)),
                  ),
                ],
              ),
            ),
          ),
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
        ref
          ..invalidate(trendingTagsProvider)
          ..invalidate(latestPostsProvider(''))
          ..invalidate(suggestionsProvider);
      },
      child: CustomScrollView(
        slivers: [
          if (recent.isNotEmpty) ...[
            SliverToBoxAdapter(
              child: title(
                t.t('search.recent'),
                trailing: TextButton(
                  onPressed: () =>
                      ref.read(recentSearchesProvider.notifier).clear(),
                  child: Text(t.t('search.recent.clear')),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(
                height: 44,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.screenSide),
                  itemCount: recent.length,
                  separatorBuilder: (_, __) =>
                      const SizedBox(width: AppSpacing.sm),
                  itemBuilder: (context, i) => AppChip(
                    label: recent[i],
                    leading:
                        const Icon(Icons.history_rounded, size: AppSpacing.lg),
                    onTap: () => onRecent(recent[i]),
                  ),
                ),
              ),
            ),
          ],
          if (basedOn.isNotEmpty) ...[
            SliverToBoxAdapter(
              child: title(t.t('search.section.basedOn', {'q': last!})),
            ),
            ...basedOn,
          ],
          ...explore,
          const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xxl)),
        ],
      ),
    );
  }
}

/// A client's own cases matching [query] (title or practice) and the
/// "My cases" filters (status, practice area); '' = all.
List<CaseSummary> _myCases(WidgetRef ref, String query, SearchFilters f) {
  final q = query.toLowerCase();
  final statuses =
      f.caseStatus == null ? MyCasesFilter.values : [f.caseStatus!];
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

/// The Cases filters the feed query does not cover (explore grid).
List<FeedCase> _filterCases(List<FeedCase> items, SearchFilters f) => [
      for (final c in items)
        if ((!f.noBids || c.bidsCount == 0) &&
            (!f.budgetUnknown || c.budget.amountCents == null) &&
            (f.budgetMin == null ||
                (c.budget.amountCents ?? -1) >= f.budgetMin! * 100) &&
            (f.budgetMax == null ||
                (c.budget.amountCents != null &&
                    c.budget.amountCents! <= f.budgetMax! * 100)))
          c,
    ];

/// The Posts explore grid under the Posts filters (topic, author's state,
/// photos only, sort).
List<Post> _explorePosts(WidgetRef ref, SearchFilters f) {
  final cat = f.practiceCategory;
  final base = cat != null
      ? ref
              .watch(tagPostsProvider((
                tag: topicTagFor(cat),
                sort: f.postSort == PostSort.popular
                    ? TagSort.top
                    : TagSort.fresh,
                state: f.state,
              )))
              .value
              ?.items ??
          const <Post>[]
      : ref.watch(latestPostsProvider(f.state ?? '')).value?.items ??
          const <Post>[];
  final items = [
    for (final p in base)
      if (!f.withPhotos || p.media.isNotEmpty) p,
  ];
  if (f.postSort == PostSort.popular && cat == null) {
    items.sort((a, b) =>
        (b.likeCount + b.commentCount).compareTo(a.likeCount + a.commentCount));
  }
  return items;
}

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
    return GridView.builder(
      padding: const EdgeInsets.all(AppSpacing.sm),
      gridDelegate: kSearchGridDelegate,
      itemCount: items.length,
      itemBuilder: (context, i) => SearchMyCaseTile(item: items[i]),
    );
  }
}
