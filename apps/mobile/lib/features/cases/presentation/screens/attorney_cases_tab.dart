import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/screens/verification_required_screen.dart';

/// The attorney's chosen practices (feed filter options, §4.2 "из своих
/// выбранных").
final myPracticesProvider = FutureProvider.autoDispose<List<SelectedPractice>>(
  (ref) => ref.watch(practicesRepositoryProvider).fetchSelected(),
);

/// docs/04 §4.2 — Feed → "Кейсы" (attorneys only): cards newest first,
/// filters by own practice / own licensed state, and the gate states:
/// not verified, no practices, no verified license.
class AttorneyCasesTab extends ConsumerStatefulWidget {
  const AttorneyCasesTab({super.key});

  @override
  ConsumerState<AttorneyCasesTab> createState() => _AttorneyCasesTabState();
}

class _AttorneyCasesTabState extends ConsumerState<AttorneyCasesTab> {
  String? _practiceId;
  String? _state;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    if (ref.watch(attorneyNeedsVerificationProvider)) {
      return const VerificationRequiredView(
          reason: VerificationGateReason.cases);
    }
    final practices = ref.watch(myPracticesProvider);
    final profile = ref.watch(ownAttorneyProfileProvider);
    final formats = ref.watch(l10nFormatsProvider);

    final loading = practices.isLoading || profile.isLoading;
    final error = practices.error ?? profile.error;
    if (error != null && !loading) {
      return CasesErrorView(
        error: error,
        t: t,
        onRetry: () => ref
          ..invalidate(myPracticesProvider)
          ..invalidate(ownAttorneyProfileProvider),
      );
    }
    if (!practices.hasValue || !profile.hasValue)
      return const CasesListSkeleton();

    final myPractices = practices.requireValue;
    final licensed = [
      for (final l in profile.requireValue.licenses)
        if (l.status == LicenseState.verified) l.state.code,
    ];
    if (licensed.isEmpty) {
      return AppEmptyState(
        icon: Icons.workspace_premium_outlined,
        title: t.t('cases.feed.noLicenseTitle'),
        message: t.t('cases.feed.noLicenseMessage'),
        action: AppButton(
          label: t.t('cases.feed.openVerification'),
          height: AppSizes.touchTarget,
          onPressed: () => context.push(AppRoutes.verification),
        ),
      );
    }
    if (myPractices.isEmpty) {
      return AppEmptyState(
        icon: Icons.balance_rounded,
        title: t.t('cases.feed.noPracticesTitle'),
        message: t.t('cases.feed.noPracticesMessage'),
        action: AppButton(
          label: t.t('cases.feed.choosePractices'),
          height: AppSizes.touchTarget,
          onPressed: () => context.push(AppRoutes.practices),
        ),
      );
    }

    final filter = (practiceAreaId: _practiceId, state: _state);
    final value = ref.watch(caseFeedProvider(filter));
    final n = ref.read(caseFeedProvider(filter).notifier);
    final practiceLabel = _practiceId == null
        ? t.t('cases.feed.allPractices')
        : myPractices
            .where((p) => p.id == _practiceId)
            .map((p) => CaseFormat.practice(t, p.i18nKey, p.nameEn))
            .firstOrNull;

    return PagedListBody<FeedCase>(
      value: value,
      t: t,
      itemKey: (c) => c.id,
      onRefresh: n.refresh,
      onLoadMore: n.loadMore,
      onRetryMore: n.retryLoadMore,
      header: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: [
          AppChip(
            label: practiceLabel ?? t.t('cases.feed.allPractices'),
            selected: _practiceId != null,
            leading: const Icon(Icons.balance_rounded, size: AppSpacing.lg),
            trailing:
                const Icon(Icons.expand_more_rounded, size: AppSpacing.lg),
            onTap: () => _pickPractice(t, myPractices),
          ),
          AppChip(
            label: _state == null
                ? t.t('cases.feed.allStates')
                : stateName(_state!),
            selected: _state != null,
            leading: const Icon(Icons.map_outlined, size: AppSpacing.lg),
            trailing:
                const Icon(Icons.expand_more_rounded, size: AppSpacing.lg),
            onTap: () => _pickState(t, licensed),
          ),
        ],
      ),
      empty: AppEmptyState(
        icon: Icons.inbox_outlined,
        title: t.t('cases.feed.emptyTitle'),
        message: t.t('cases.feed.emptyMessage'),
      ),
      itemBuilder: (context, c, _) => FeedCaseCard(
        item: c,
        t: t,
        formats: formats,
        onTap: () => context.push(AppRoutes.caseDetail(c.id)),
      ),
    );
  }

  Future<void> _pickPractice(
      Translator t, List<SelectedPractice> options) async {
    final picked = await _pickOption(
      t,
      title: t.t('cases.feed.practiceFilter'),
      options: [
        for (final p in options)
          (p.id, CaseFormat.practice(t, p.i18nKey, p.nameEn)),
      ],
      selected: _practiceId,
    );
    if (picked != null)
      setState(() => _practiceId = picked.isEmpty ? null : picked);
  }

  Future<void> _pickState(Translator t, List<String> codes) async {
    final picked = await _pickOption(
      t,
      title: t.t('cases.feed.stateFilter'),
      options: [for (final c in codes) (c, stateName(c))],
      selected: _state,
    );
    if (picked != null) setState(() => _state = picked.isEmpty ? null : picked);
  }

  /// Returns '' for "All", null when dismissed.
  Future<String?> _pickOption(
    Translator t, {
    required String title,
    required List<(String, String)> options,
    required String? selected,
  }) =>
      showAppBottomSheet<String>(
        context: context,
        isScrollControlled: true,
        builder: (context) {
          final colors = Theme.of(context).extension<AppColorTokens>()!;
          final typography =
              Theme.of(context).extension<AppTypographyTokens>()!;
          Widget row(String key, String label) => Semantics(
                button: true,
                selected: (selected ?? '') == key,
                label: label,
                excludeSemantics: true,
                child: AppPressable(
                  onTap: () => Navigator.of(context).pop(key),
                  child: ConstrainedBox(
                    constraints:
                        const BoxConstraints(minHeight: AppSizes.hitTarget),
                    child: Row(
                      children: [
                        Expanded(
                            child: Text(label,
                                style: typography.body
                                    .copyWith(color: colors.text))),
                        if ((selected ?? '') == key)
                          Icon(Icons.check_rounded, color: colors.goldDark),
                      ],
                    ),
                  ),
                ),
              );
          return SafeArea(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                  maxHeight: MediaQuery.sizeOf(context).height * 0.75),
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.md,
                  AppSpacing.screenSide,
                  AppSpacing.lg,
                ),
                children: [
                  const AppSheetHandle(),
                  const SizedBox(height: AppSpacing.lg),
                  Text(title,
                      style:
                          typography.titleMedium.copyWith(color: colors.text)),
                  const SizedBox(height: AppSpacing.md),
                  row('', t.t('cases.feed.all')),
                  for (final (k, l) in options) row(k, l),
                ],
              ),
            ),
          );
        },
      );
}
