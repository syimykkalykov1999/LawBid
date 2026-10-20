import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/legal_qa_routes.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_filter_sheet.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_widgets.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/presentation/flip_search_bar.dart';

/// Owner 2026-10-20 — «Вопрос юристу»: all questions, unanswered, solved
/// and mine; search, topic and state; «Ask» for clients.
class QaFeedScreen extends ConsumerStatefulWidget {
  const QaFeedScreen({this.initialUnanswered = false, super.key});

  /// Opened from the «New questions» card: starts on «Unanswered».
  final bool initialUnanswered;

  @override
  ConsumerState<QaFeedScreen> createState() => _QaFeedScreenState();
}

class _QaFeedScreenState extends ConsumerState<QaFeedScreen> {
  final _search = TextEditingController();
  final _focus = FocusNode();
  Timer? _debounce;
  late QuestionsQuery _query = widget.initialUnanswered
      ? const QuestionsQuery(filter: QaFilter.unanswered)
      : const QuestionsQuery();

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
    super.dispose();
  }

  void _onSearch(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _query = _query.copyWith(q: text));
    });
  }

  Future<void> _openFilters(bool attorney) async {
    final r = await showQaFilterSheet(
      context,
      current: _query,
      attorney: attorney,
    );
    if (r != null && mounted) setState(() => _query = r.copyWith(q: _query.q));
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final attorney = ref.watch(actsAsAttorneyProvider);
    final async = ref.watch(questionsProvider(_query));
    final notifier = ref.read(questionsProvider(_query).notifier);
    final active = _query.filter != QaFilter.all || _query.activeFilters > 0;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('qa.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      floatingActionButton: attorney
          ? null
          : FloatingActionButton.extended(
              backgroundColor: colors.accent,
              foregroundColor: colors.onAccent,
              onPressed: () => context.push(LegalQaRoutes.ask),
              icon: const AppIcon(AppIcons.addRounded),
              label: Text(t.t('qa.ask')),
            ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
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
              child: async.when(
                loading: () => Center(
                  child: CircularProgressIndicator(color: colors.gold),
                ),
                error: (e, _) => AppErrorState(
                  message: errorText(t, e),
                  retryLabel: t.t('error.retry'),
                  onRetry: () => ref.invalidate(questionsProvider(_query)),
                ),
                data: (page) => page.items.isEmpty
                    ? AppEmptyState(
                        icon: AppIcons.helpOutlineRounded,
                        title: t.t(
                          _query.filter == QaFilter.mine
                              ? 'qa.empty.mine'
                              : 'qa.empty.title',
                        ),
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
                            itemCount: page.items.length +
                                (page.isLoadingMore ? 1 : 0),
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: AppSpacing.md),
                            itemBuilder: (_, i) => i >= page.items.length
                                ? Center(
                                    child: CircularProgressIndicator(
                                      color: colors.gold,
                                    ),
                                  )
                                : QuestionCard(
                                    question: page.items[i],
                                    onTap: () => context.push(
                                      LegalQaRoutes.question(page.items[i].id),
                                    ),
                                  ),
                          ),
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
