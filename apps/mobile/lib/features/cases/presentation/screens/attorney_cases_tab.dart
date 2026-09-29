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
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
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
    // Owner 2026-09-29: the filter offers every practice, not only the
    // attorney's own; the tree loads alongside.
    final tree = ref.watch(practiceTreeProvider);
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
    final allLeaves = [
      for (final c in tree.value ?? const <PracticeCategory>[])
        for (final l in c.children) l,
    ];
    final practiceLabel = _practiceId == null
        ? t.t('cases.feed.allPractices')
        : allLeaves
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
            onTap: () => _pickPractice(t, allLeaves),
          ),
          AppChip(
            label: _state == null
                ? t.t('cases.feed.allStates')
                : stateName(_state!),
            selected: _state != null,
            leading: const Icon(Icons.map_outlined, size: AppSpacing.lg),
            trailing:
                const Icon(Icons.expand_more_rounded, size: AppSpacing.lg),
            onTap: () => _pickState(t),
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

  /// Owner 2026-09-29: every practice (searchable), "All" first.
  Future<void> _pickPractice(Translator t, List<PracticeLeaf> leaves) async {
    final picked = await _pickOption(
      t,
      title: t.t('cases.feed.practiceFilter'),
      options: [
        for (final p in leaves)
          PickerOption(
            value: p.id,
            label: CaseFormat.practice(t, p.i18nKey, p.nameEn),
          ),
      ],
      selected: _practiceId,
    );
    if (picked != null) {
      setState(() => _practiceId = picked.isEmpty ? null : picked);
    }
  }

  /// Owner 2026-09-29: every US state (searchable), "All" first.
  Future<void> _pickState(Translator t) async {
    final picked = await _pickOption(
      t,
      title: t.t('cases.feed.stateFilter'),
      options: [
        for (final s in kUsStates)
          PickerOption(value: s.code, label: s.name, sublabel: s.code),
      ],
      selected: _state,
    );
    if (picked != null) setState(() => _state = picked.isEmpty ? null : picked);
  }

  /// Returns '' for "All", null when dismissed.
  Future<String?> _pickOption(
    Translator t, {
    required String title,
    required List<PickerOption> options,
    required String? selected,
  }) async {
    final result = await OptionPickerSheet.show(
      context,
      title: title,
      options: [
        PickerOption(value: '', label: t.t('cases.feed.all')),
        ...options
      ],
      initial: {selected ?? ''},
    );
    return result?.firstOrNull;
  }
}
