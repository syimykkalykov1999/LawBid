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
import 'package:lawbid/features/legal_qa/presentation/qa_widgets.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

/// Owner 2026-10-20 — «Вопрос юристу»: all questions, unanswered, solved
/// and mine; search, topic and state; «Ask» for clients.
class QaFeedScreen extends ConsumerStatefulWidget {
  const QaFeedScreen({super.key});

  @override
  ConsumerState<QaFeedScreen> createState() => _QaFeedScreenState();
}

class _QaFeedScreenState extends ConsumerState<QaFeedScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  QuestionsQuery _query = const QuestionsQuery();

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onSearch(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _query = _query.copyWith(q: text));
    });
  }

  Future<void> _pickArea() async {
    final t = ref.read(translatorProvider);
    final r = await pickQaArea(
      context,
      ref,
      title: t.t('qa.area'),
      current: _query.practiceAreaId,
    );
    if (r == null || !mounted) return;
    setState(
      () => _query = r.id.isEmpty
          ? _query.copyWith(clearPractice: true)
          : _query.copyWith(practiceAreaId: r.id, practiceLabel: r.label),
    );
  }

  Future<void> _pickState() async {
    final t = ref.read(translatorProvider);
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('qa.state'),
      options: [
        for (final s in kRegions)
          PickerOption(value: s.code, label: s.name, sublabel: s.code),
      ],
      initial: {if (_query.stateCode != null) _query.stateCode!},
    );
    if (picked == null || !mounted) return;
    setState(
      () => _query = picked.isEmpty
          ? _query.copyWith(clearState: true)
          : _query.copyWith(stateCode: picked.first),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final attorney = ref.watch(actsAsAttorneyProvider);
    final async = ref.watch(questionsProvider(_query));
    final notifier = ref.read(questionsProvider(_query).notifier);
    final stateName = _query.stateCode ?? t.t('qa.allStates');
    final areaName = _query.practiceLabel ?? t.t('qa.allAreas');
    final tabs = [
      (QaFilter.all, t.t('qa.tab.all')),
      (QaFilter.unanswered, t.t('qa.tab.unanswered')),
      (QaFilter.solved, t.t('qa.tab.solved')),
      if (!attorney) (QaFilter.mine, t.t('qa.tab.mine')),
    ];

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
              child: AppTextField(
                controller: _search,
                hintText: t.t('qa.search'),
                semanticLabel: t.t('qa.search'),
                leading: AppIcon(
                  AppIcons.searchRounded,
                  color: colors.textSecondary,
                ),
                textInputAction: TextInputAction.search,
                onChanged: _onSearch,
              ),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenSide,
              ),
              child: Row(
                children: [
                  for (final (f, label) in tabs) ...[
                    AppChip(
                      label: label,
                      selected: _query.filter == f,
                      onTap: () =>
                          setState(() => _query = _query.copyWith(filter: f)),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenSide,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: AppChip(
                      label: areaName,
                      expand: true,
                      selected: _query.practiceAreaId != null,
                      trailing: AppIcon(
                        AppIcons.expandMoreRounded,
                        size: 18,
                        color: colors.textSecondary,
                      ),
                      onTap: _pickArea,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: AppChip(
                      label: stateName,
                      expand: true,
                      selected: _query.stateCode != null,
                      trailing: AppIcon(
                        AppIcons.expandMoreRounded,
                        size: 18,
                        color: colors.textSecondary,
                      ),
                      onTap: _pickState,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
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
