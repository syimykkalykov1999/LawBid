import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/back_swipe.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/legal_qa_routes.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_filter_sheet.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_tabs_bar.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_widgets.dart';
import 'package:lawbid/features/legal_qa/presentation/question_detail_screen.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

/// Owner 2026-10-20 — «Вопрос юристу»: all questions, unanswered, solved
/// and mine; search, topic and state; «Ask» for clients.
///
/// Owner 2026-10-23: the same content is the third tab of «Дела» (see
/// [QaFeedBody]); this screen stays for links, banners and the search «?».
class QaFeedScreen extends ConsumerWidget {
  const QaFeedScreen({this.initialUnanswered = false, super.key});

  /// Opened from the «New questions» card: starts on «Unanswered».
  final bool initialUnanswered;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('qa.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: QaFeedBody(initialUnanswered: initialUnanswered),
    );
  }
}

/// The questions and answers: sections (All · Mine · Best · Unanswered),
/// the notification switch (attorneys), search, filters, «Ask» for clients.
/// No Scaffold of its own: it lives in the «Вопросы» tab of the Cases
/// screen and under [QaFeedScreen].
class QaFeedBody extends ConsumerStatefulWidget {
  const QaFeedBody({
    this.initialUnanswered = false,
    this.embedded = false,
    super.key,
  });

  final bool initialUnanswered;

  /// Inside the Cases tabs: the sections change by tap only, a swipe moves
  /// between the Cases tabs; a drag to the right is not «back».
  final bool embedded;

  @override
  ConsumerState<QaFeedBody> createState() => _QaFeedBodyState();
}

class _QaFeedBodyState extends ConsumerState<QaFeedBody> {
  final _search = TextEditingController();

  /// Owner 2026-10-23: the search is a magnifier at the end of the chips row
  /// (like Tasks); it opens the field under the row.
  bool _searchOpen = false;
  Timer? _debounce;
  // The tab sets the filter, the search and the topic/state filters stay
  // the same across tabs (owner 2026-10-21).
  QuestionsQuery _query = const QuestionsQuery();
  late QaTab _tab = widget.initialUnanswered ? QaTab.unanswered : QaTab.all;
  late final _pages = PageController(initialPage: _tab.index);

  @override
  void initState() {
    super.initState();
    _search.addListener(() => _onSearch(_search.text));
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _pages.dispose();
    super.dispose();
  }

  void _onSearch(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _query = _query.copyWith(q: text));
    });
  }

  void _toggleSearch() {
    setState(() {
      _searchOpen = !_searchOpen;
      // Closed: the search no longer narrows the list.
      if (!_searchOpen) _search.clear();
    });
  }

  void _pick(QaTab v) {
    setState(() => _tab = v);
    if (!_pages.hasClients) return;
    if (context.reduceMotion) {
      _pages.jumpToPage(v.index);
      return;
    }
    const motion = Duration(milliseconds: 260);
    unawaited(
      _pages.animateToPage(
        v.index,
        duration: motion,
        curve: Curves.easeOutCubic,
      ),
    );
  }

  /// The query of one tab: an attorney's «All», «Best» and «Unanswered» stay
  /// within their own practice unless a topic is picked by hand.
  QuestionsQuery _queryFor(QaTab tab, bool attorney) => _query.copyWith(
        filter: tab.filter,
        mineScope:
            attorney && tab != QaTab.mine && _query.practiceAreaId == null,
      );

  Future<void> _openFilters(bool attorney) async {
    final r = await showQaFilterSheet(
      context,
      current: _query,
      attorney: attorney,
    );
    if (r != null && mounted) setState(() => _query = r.copyWith(q: _query.q));
  }

  Widget _sections(bool attorney, ScrollPhysics? physics) => PageView(
        controller: _pages,
        physics: physics,
        onPageChanged: (i) => setState(() => _tab = QaTab.values[i]),
        children: [
          for (final tab in QaTab.values)
            _QaPage(
              key: ValueKey('qa-page-${tab.name}'),
              query: _queryFor(tab, attorney),
              attorney: attorney,
              mineTab: tab == QaTab.mine,
            ),
        ],
      );

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final attorney = ref.watch(actsAsAttorneyProvider);
    final active = _query.activeFilters > 0;

    return Stack(
      children: [
        SafeArea(
          top: false,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsetsDirectional.only(
                  start: AppSpacing.screenSide,
                  end: AppSpacing.xs,
                  top: AppSpacing.sm,
                ),
                // Owner 2026-10-22: one bar, placed by itself, for client and
                // attorney. Owner 2026-10-23: the filter and the magnifier
                // are round buttons at its end (like Tasks).
                child: Row(
                  children: [
                    Expanded(
                      child: QaTabsBar(
                        value: _tab,
                        onChanged: _pick,
                        labels: [
                          t.t('qa.tab.all'),
                          t.t('qa.tab.mine'),
                          t.t('qa.tab.solved'),
                          t.t('qa.tab.unanswered'),
                        ],
                      ),
                    ),
                    AppRoundChipButton(
                      key: const ValueKey('qa-filter-button'),
                      icon: AppIcons.tuneRounded,
                      label: t.t('search.filters'),
                      dot: active,
                      onTap: () => unawaited(_openFilters(attorney)),
                    ),
                    AppRoundChipButton(
                      key: const ValueKey('qa-search-open'),
                      icon: AppIcons.searchRounded,
                      label: t.t('qa.search'),
                      selected: _searchOpen,
                      onTap: _toggleSearch,
                    ),
                  ],
                ),
              ),
              // Owner 2026-10-23: new questions never ring until switched on.
              if (attorney)
                ref.watch(qaNotifySwitchProvider)?.call() ??
                    const SizedBox.shrink(),
              if (_searchOpen)
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    AppSpacing.sm,
                    AppSpacing.screenSide,
                    0,
                  ),
                  child: AppTextField(
                    compact: true,
                    key: const ValueKey('qa-search'),
                    controller: _search,
                    label: t.t('qa.search'),
                    leading: const AppIcon(AppIcons.searchRounded),
                    autofocus: true,
                    trailing: IconButton(
                      key: const ValueKey('qa-search-close'),
                      tooltip: t.t('common.close'),
                      onPressed: _toggleSearch,
                      icon: AppIcon(
                        AppIcons.closeRounded,
                        color: colors.textSecondary,
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: AppSpacing.sm),
              Expanded(
                // Owner 2026-10-22: the first page's drag to the right is
                // «back».
                child: widget.embedded
                    // Owner 2026-10-28: inside the Cases tabs these sections
                    // change by tap only; a swipe moves between the tabs.
                    ? SwipePages<QaTab>(
                        swipe: false,
                        value: _tab,
                        values: QaTab.values,
                        onChanged: (v) => setState(() => _tab = v),
                        pageBuilder: (_, tab) => _QaPage(
                          key: ValueKey('qa-page-${tab.name}'),
                          query: _queryFor(tab, attorney),
                          attorney: attorney,
                          mineTab: tab == QaTab.mine,
                        ),
                      )
                    : BackAwarePages(
                        controller: _pages,
                        child: _sections(
                          attorney,
                          BackAwarePages.physicsFor(context),
                        ),
                      ),
              ),
            ],
          ),
        ),
        // Owner 2026-10-23: «Ask a question» is the app's floating «+».
        if (!attorney)
          PositionedDirectional(
            end: AppSpacing.screenSide,
            bottom: AppSpacing.screenSide,
            child: AppFab(
              buttonKey: const ValueKey('qa-ask'),
              semanticLabel: t.t('qa.ask'),
              onPressed: () => context.push(LegalQaRoutes.ask),
            ),
          ),
      ],
    );
  }
}

/// One tab's infinite list; tapping a question lifts the sheet with its
/// answers (the full screen stays for deep links).
class _QaPage extends ConsumerWidget {
  const _QaPage({
    required this.query,
    required this.attorney,
    required this.mineTab,
    super.key,
  });

  final QuestionsQuery query;
  final bool attorney;
  final bool mineTab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final async = ref.watch(questionsProvider(query));
    final notifier = ref.read(questionsProvider(query).notifier);
    return async.when(
      // Owner 2026-10-23: skeleton cards, not a spinner.
      loading: () => const CasesListSkeleton(),
      error: (e, _) => AppErrorState(
        message: errorText(t, e),
        retryLabel: t.t('error.retry'),
        onRetry: () => ref.invalidate(questionsProvider(query)),
      ),
      data: (page) => page.items.isEmpty
          ? AppEmptyState(
              icon: AppIcons.helpOutlineRounded,
              title: t.t(mineTab ? 'qa.empty.mine' : 'qa.empty.title'),
              message: t.t(
                attorney ? 'qa.empty.attorney' : 'qa.empty.message',
              ),
            )
          : RefreshIndicator(
              color: colors.gold,
              onRefresh: notifier.refresh,
              child: NotificationListener<ScrollNotification>(
                onNotification: (n) {
                  if (n.metrics.extentAfter < 400) {
                    unawaited(notifier.loadMore());
                  }
                  return false;
                },
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    AppSpacing.sm,
                    AppSpacing.screenSide,
                    88,
                  ),
                  itemCount: page.items.length + (page.isLoadingMore ? 1 : 0),
                  separatorBuilder: (_, __) =>
                      const SizedBox(height: AppSpacing.md),
                  itemBuilder: (_, i) => i >= page.items.length
                      ? const Padding(
                          padding: EdgeInsets.symmetric(
                            vertical: AppSpacing.md,
                          ),
                          child: AppContentCardSkeleton(),
                        )
                      : QuestionCard(
                          question: page.items[i],
                          attorney: attorney,
                          onTap: () => unawaited(
                            showQuestionSheet(context, page.items[i].id),
                          ),
                        ),
                ),
              ),
            ),
    );
  }
}
