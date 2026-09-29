import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/search/application/search_providers.dart';
import 'package:lawbid/features/search/data/search_repository.dart';
import 'package:lawbid/features/search/presentation/widgets/flip_search_bar.dart';
import 'package:lawbid/features/search/presentation/widgets/search_filters_sheet.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/social/social_routes.dart';
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
  SearchFilters _attorneyFilters = const SearchFilters();
  SearchFilters _caseFilters = const SearchFilters();

  /// Owner 2026-09-29: the field is hidden behind a magnifier button in
  /// the tabs row; tapping it expands the field over the row.
  bool _expanded = false;

  void _expand() {
    setState(() => _expanded = true);
    // Focus after the field is in the tree.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _expanded) _focus.requestFocus();
    });
  }

  void _collapse() {
    _timer?.cancel();
    _focus.unfocus();
    _controller.clear();
    setState(() {
      _expanded = false;
      _query = '';
    });
  }

  /// Magnifier inside the expanded field: submits a query, or closes the
  /// field when there is nothing to search.
  void _onMagnifier() {
    if (_controller.text.trim().isEmpty) {
      _collapse();
      return;
    }
    _timer?.cancel();
    final next = normalizeSearch(_controller.text);
    if (next.length >= kSearchMinChars) {
      setState(() => _query = next);
      ref.read(recentSearchesProvider.notifier).remember(next);
    }
    _focus.unfocus();
  }

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
    setState(() {
      _expanded = true;
      _query = normalizeSearch(q);
    });
  }

  Future<void> _openFilters(bool forCases) async {
    final picked = await showSearchFilters(
      context,
      initial: forCases ? _caseFilters : _attorneyFilters,
      forCases: forCases,
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (forCases) {
        _caseFilters = picked;
      } else {
        _attorneyFilters = picked;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final attorney = ref.watch(currentUserRoleProvider) == UserRole.attorney;
    final tabs = [
      (
        SearchTab.attorneys,
        t.t(attorney ? 'search.tab.people' : 'search.tab.attorneys'),
      ),
      if (attorney) (SearchTab.cases, t.t('search.tab.cases')),
      (SearchTab.posts, t.t('search.tab.posts')),
      (SearchTab.tags, t.t('search.tab.tags')),
    ];
    if (!tabs.any((x) => x.$1 == _tab)) _tab = SearchTab.attorneys;
    final filterable = _tab == SearchTab.attorneys || _tab == SearchTab.cases;
    final filters = _tab == SearchTab.cases ? _caseFilters : _attorneyFilters;
    final motion = context.reduceMotion ? Duration.zero : AppMotion.stateChange;

    final tabsRow = PillTabs<SearchTab>(
      value: _tab,
      tabs: tabs,
      padding: EdgeInsets.zero,
      onChanged: (v) => setState(() => _tab = v),
    );

    // Filters button: inside the field at the left edge (owner
    // 2026-09-29). Dimmed on tabs that have no filters yet.
    final filterButton = Badge(
      isLabelVisible: filterable && filters.activeCount > 0,
      label: Text('${filters.activeCount}'),
      backgroundColor: colors.gold,
      textColor: colors.navy,
      child: AppIconButton(
        icon: Icon(
          Icons.tune_rounded,
          color: filterable ? colors.text : colors.textSecondary,
        ),
        semanticLabel: t.t('search.filters'),
        onPressed:
            filterable ? () => _openFilters(_tab == SearchTab.cases) : null,
      ),
    );

    final field = FlipSearchBar(
      controller: _controller,
      focusNode: _focus,
      semanticLabel: t.t('search.field'),
      cancelLabel: t.t('common.cancel'),
      clearLabel: t.t('search.clear'),
      showCancel: false,
      leading: filterButton,
      trailing: AppIconButton(
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

    return PopScope(
      // Android back while the field is open closes the field first.
      canPop: !_expanded,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _expanded) _collapse();
      },
      child: Scaffold(
        backgroundColor: colors.bg,
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                ),
                child: AnimatedSwitcher(
                  duration: motion,
                  switchInCurve: AppMotion.enterCurve,
                  switchOutCurve: AppMotion.enterCurve,
                  layoutBuilder: (current, previous) => Stack(
                    alignment: Alignment.centerRight,
                    children: [...previous, if (current != null) current],
                  ),
                  transitionBuilder: (child, animation) => FadeTransition(
                    opacity: animation,
                    child: SizeTransition(
                      sizeFactor: animation,
                      axis: Axis.horizontal,
                      axisAlignment: 1,
                      child: child,
                    ),
                  ),
                  child: _expanded
                      ? KeyedSubtree(
                          key: const ValueKey('field'),
                          child: field,
                        )
                      : Row(
                          key: const ValueKey('tabs'),
                          children: [
                            Expanded(child: tabsRow),
                            const SizedBox(width: AppSpacing.sm),
                            // 48 px hit box must fit inside the row's
                            // clip: the row is 48 tall and leaves 2 px on
                            // the right.
                            SizedBox(
                              height: AppSizes.hitTarget,
                              child: Padding(
                                padding: const EdgeInsets.only(
                                  right: (AppSizes.hitTarget -
                                          AppSizes.touchTarget) /
                                      2,
                                ),
                                child: Center(
                                  child: AppIconButton(
                                    icon: Icon(
                                      Icons.search_rounded,
                                      color: colors.text,
                                    ),
                                    semanticLabel: t.t('search.open'),
                                    onPressed: _expand,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                ),
              ),
              // While searching, the result sections stay switchable
              // under the field.
              AnimatedSize(
                duration: motion,
                curve: AppMotion.enterCurve,
                alignment: Alignment.topCenter,
                child: _expanded && _query.isNotEmpty
                    ? Padding(
                        padding: const EdgeInsets.fromLTRB(
                          AppSpacing.screenSide,
                          0,
                          AppSpacing.screenSide,
                          AppSpacing.sm,
                        ),
                        child: tabsRow,
                      )
                    : const SizedBox(width: double.infinity),
              ),
              Expanded(
                child: AnimatedSwitcher(
                  duration: context.reduceMotion
                      ? Duration.zero
                      : AppMotion.stateChange,
                  child: _query.isEmpty
                      ? _BeforeTyping(
                          key: const ValueKey('idle'),
                          onRecent: _useRecent,
                        )
                      : KeyedSubtree(
                          key: ValueKey('$_tab:$_query'),
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
    final formats = ref.watch(l10nFormatsProvider);
    final nothing = AppEmptyState(
      icon: Icons.search_off_rounded,
      title: t.t('search.empty.title'),
      message: t.t('search.empty.message', {'query': query}),
    );
    final key = (q: query, filters: filters);
    switch (tab) {
      case SearchTab.attorneys:
        final n = ref.read(attorneySearchProvider(key).notifier);
        return PagedListBody<AttorneyRow>(
          value: ref.watch(attorneySearchProvider(key)),
          t: t,
          itemKey: (r) => r.id,
          itemBuilder: (context, r, _) => AttorneyTile(row: r),
          empty: nothing,
          onRefresh: n.refresh,
          onLoadMore: n.loadMore,
          onRetryMore: n.retryLoadMore,
        );
      case SearchTab.cases:
        final n = ref.read(caseSearchProvider(key).notifier);
        return PagedListBody<FeedCase>(
          value: ref.watch(caseSearchProvider(key)),
          t: t,
          itemKey: (c) => c.id,
          itemBuilder: (context, c, _) => FeedCaseCard(
            item: c,
            t: t,
            formats: formats,
            onTap: () => context.push(AppRoutes.caseDetail(c.id)),
          ),
          empty: nothing,
          onRefresh: n.refresh,
          onLoadMore: n.loadMore,
          onRetryMore: n.retryLoadMore,
        );
      case SearchTab.posts:
        final n = ref.read(postSearchProvider(query).notifier);
        return PagedListBody<Post>(
          value: ref.watch(postSearchProvider(query)),
          t: t,
          skeleton: const PostListSkeleton(),
          itemKey: (p) => p.id,
          itemBuilder: (context, p, _) => PostCard(post: p),
          empty: nothing,
          onRefresh: n.refresh,
          onLoadMore: n.loadMore,
          onRetryMore: n.retryLoadMore,
        );
      case SearchTab.tags:
        return AsyncDetailBody<List<TagInfo>>(
          value: ref.watch(tagSearchProvider(query)),
          t: t,
          onRetry: () => ref.invalidate(tagSearchProvider(query)),
          builder: (tags) => tags.isEmpty
              ? nothing
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                  itemCount: tags.length,
                  itemBuilder: (context, i) => _TagRow(tag: tags[i]),
                ),
        );
    }
  }
}

class _TagRow extends StatelessWidget {
  const _TagRow({required this.tag});

  final TagInfo tag;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return AppPressable(
      onTap: () => context.push(SocialRoutes.tag(tag.tag)),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenSide,
          vertical: AppSpacing.md,
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: colors.goldTint,
                border: Border.all(color: colors.goldStroke),
              ),
              child: Icon(Icons.tag_rounded, color: colors.goldDark),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Text(
                '#${tag.tag}',
                style: type.body.copyWith(
                  color: colors.text,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: colors.textSecondary),
          ],
        ),
      ),
    );
  }
}

/// §7.2 before typing: recent searches (clearable), popular topics,
/// suggested attorneys.
class _BeforeTyping extends ConsumerWidget {
  const _BeforeTyping({required this.onRecent, super.key});

  final ValueChanged<String> onRecent;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final recent = ref.watch(recentSearchesProvider).value ?? const [];
    final trending = ref.watch(trendingTagsProvider);

    Widget title(String text, {Widget? trailing}) => Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.lg,
            AppSpacing.sm,
            AppSpacing.sm,
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  text,
                  style: type.titleMedium.copyWith(color: colors.text),
                ),
              ),
              if (trailing != null) trailing,
            ],
          ),
        );

    return RefreshIndicator(
      color: colors.gold,
      onRefresh: () async => ref.invalidate(trendingTagsProvider),
      child: ListView(
        padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
        children: [
          if (recent.isNotEmpty) ...[
            title(
              t.t('search.recent'),
              trailing: TextButton(
                onPressed: () =>
                    ref.read(recentSearchesProvider.notifier).clear(),
                child: Text(t.t('search.recent.clear')),
              ),
            ),
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
              child: Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: [
                  for (final q in recent)
                    AppChip(
                      label: q,
                      leading: const Icon(Icons.history_rounded,
                          size: AppSpacing.lg),
                      onTap: () => onRecent(q),
                    ),
                ],
              ),
            ),
          ],
          ...switch (trending) {
            AsyncData(:final value) when value.isNotEmpty => [
                title(t.t('search.trending')),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.screenSide,
                  ),
                  child: Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: staggeredEntrance([
                      for (final tag in value)
                        AppChip(
                          label: tag.postsCount == null
                              ? '#${tag.tag}'
                              : '#${tag.tag} · ${SocialFormat.count(f, tag.postsCount!)}',
                          leading: Icon(
                            Icons.local_fire_department_rounded,
                            size: AppSpacing.lg,
                            color: colors.gold,
                          ),
                          onTap: () => context.push(SocialRoutes.tag(tag.tag)),
                        ),
                    ]),
                  ),
                ),
              ],
            AsyncError(:final error) when isOfflineError(error) => [
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.screenSide),
                  child: Text(
                    t.t('offline.message'),
                    style: type.bodySmall.copyWith(color: colors.textSecondary),
                  ),
                ),
              ],
            _ => const <Widget>[],
          },
          const SuggestedAttorneys(),
        ],
      ),
    );
  }
}
