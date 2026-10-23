import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/back_swipe.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/legal_qa_routes.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_filter_sheet.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_notify_switch.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_tabs_bar.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_widgets.dart';
import 'package:lawbid/features/legal_qa/presentation/question_detail_screen.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/presentation/flip_search_bar.dart';

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

  /// Inside the Cases tabs: the sections change by tap only, so the swipe
  /// between the Cases tabs stays free (a PageView in a PageView would eat
  /// it) and a drag to the right is not «back».
  final bool embedded;

  @override
  ConsumerState<QaFeedBody> createState() => _QaFeedBodyState();
}

class _QaFeedBodyState extends ConsumerState<QaFeedBody> {
  final _search = TextEditingController();
  final _focus = FocusNode();
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
    _focus.dispose();
    _pages.dispose();
    super.dispose();
  }

  void _onSearch(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _query = _query.copyWith(q: text));
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
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  0,
                ),
                // Owner 2026-10-22: one bar, placed by itself, for client and
                // attorney.
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
              // Owner 2026-10-23: new questions never ring until switched on.
              if (attorney) const QaNotifySwitch(),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                ),
                // Owner 2026-10-20: the compact 36 px field (as in Channels).
                child: FlipSearchBar(
                  controller: _search,
                  focusNode: _focus,
                  hints: [t.t('qa.search')],
                  semanticLabel: t.t('qa.search'),
                  cancelLabel: t.t('common.cancel'),
                  clearLabel: t.t('search.clear'),
                  showCancel: false,
                  leading: _FilterButton(
                    active: active,
                    label: t.t('search.filters'),
                    onTap: () => unawaited(_openFilters(attorney)),
                  ),
                  trailing: AppIcon(
                    AppIcons.searchRounded,
                    color: colors.textSecondary,
                  ),
                  onSubmitted: _onSearch,
                ),
              ),
              Expanded(
                // Owner 2026-10-22: the first page's drag to the right is
                // «back».
                child: widget.embedded
                    ? _sections(attorney, const NeverScrollableScrollPhysics())
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
        if (!attorney)
          PositionedDirectional(
            end: AppSpacing.screenSide,
            bottom: AppSpacing.lg,
            child: SafeArea(
              top: false,
              child: FloatingActionButton.extended(
                heroTag: null,
                tooltip: t.t('qa.ask'),
                backgroundColor: colors.accent,
                foregroundColor: colors.onAccent,
                onPressed: () => context.push(LegalQaRoutes.ask),
                icon: const AppIcon(AppIcons.addRounded),
                label: Text(t.t('qa.ask')),
              ),
            ),
          ),
      ],
    );
  }
}

/// The filter button at the start of the search field; a dot shows that a
/// filter is on.
class _FilterButton extends StatelessWidget {
  const _FilterButton({
    required this.active,
    required this.label,
    required this.onTap,
  });

  final bool active;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        key: const ValueKey('qa-filter-button'),
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            AppIcon(AppIcons.tuneRounded, color: colors.text),
            if (active)
              PositionedDirectional(
                top: -2,
                end: -2,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: colors.accent,
                    shape: BoxShape.circle,
                  ),
                  child: const SizedBox.square(dimension: 8),
                ),
              ),
          ],
        ),
      ),
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
