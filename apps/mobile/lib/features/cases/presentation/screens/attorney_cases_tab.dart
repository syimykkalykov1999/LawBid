import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:lawbid/features/feed/presentation/widgets/topic_filter_bar.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/screens/verification_required_screen.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart'
    show feedCardHeight;

/// The attorney's chosen practices (feed filter options, §4.2 "из своих
/// выбранных").
final myPracticesProvider = FutureProvider.autoDispose<List<SelectedPractice>>(
  (ref) => ref.watch(practicesRepositoryProvider).fetchSelected(),
);

/// docs/04 §4.2 — Feed → "Кейсы" (attorneys only): cards newest first,
/// filters by practice / state (or all own licensed states), gated only
/// on attorney verification.
class AttorneyCasesTab extends ConsumerStatefulWidget {
  const AttorneyCasesTab({super.key});

  @override
  ConsumerState<AttorneyCasesTab> createState() => _AttorneyCasesTabState();
}

class _AttorneyCasesTabState extends ConsumerState<AttorneyCasesTab> {
  /// Practice category from the topic slider (null = all).
  String? _category;
  // Owner 2026-10-06: several states at once (kMyLicensedStates = all my
  // licensed states).
  Set<String> _states = {};

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    if (ref.watch(attorneyNeedsVerificationProvider)) {
      return const VerificationRequiredView(
        reason: VerificationGateReason.cases,
      );
    }
    final profile = ref.watch(ownAttorneyProfileProvider);
    final formats = ref.watch(l10nFormatsProvider);

    if (profile.hasError && !profile.isLoading) {
      return CasesErrorView(
        error: profile.error!,
        t: t,
        onRetry: () => ref.invalidate(ownAttorneyProfileProvider),
      );
    }
    if (!profile.hasValue) {
      return const CasesListSkeleton();
    }

    // Audit 2026-10-04: no full-screen gate for missing licences or
    // practices — the "All" feed works without them; with no verified
    // licence the "All my licensed states" option is just hidden.
    final licensed = [
      for (final l in profile.requireValue.licenses)
        if (l.status == LicenseState.verified) l.state.code,
    ];

    final mine = _states.contains(kMyLicensedStates);
    final codes = _states.where((c) => c != kMyLicensedStates).toList()..sort();
    final filter = (
      practiceCategory: _category,
      state: codes.isEmpty ? null : codes.join(','),
      mineOnly: mine,
    );
    final value = ref.watch(caseFeedProvider(filter));
    final n = ref.read(caseFeedProvider(filter).notifier);

    // Owner 2026-09-30 (OQ-034): the same topic slider and filter as the
    // post feed; one case card fills the screen down to the nav bar.
    return Column(
      children: [
        TopicFilterBar(
          category: _category,
          onCategory: (v) => setState(() => _category = v),
          stateCodes: _states,
          onStates: (v) => setState(() => _states = v),
          showNews: false,
          showNotSure: true,
          allowedStates: licensed.isEmpty ? null : licensed,
        ),
        Expanded(
          child: LayoutBuilder(
            builder: (context, box) {
              final height = feedCardHeight(box.maxHeight);
              return PagedListBody<FeedCase>(
                value: value,
                t: t,
                edgeToEdge: true,
                itemKey: (c) => c.id,
                onRefresh: n.refresh,
                onLoadMore: n.loadMore,
                onRetryMore: n.retryLoadMore,
                // Audit 2026-10-01: the empty state names the active filters
                // and offers to clear them.
                empty: _category == null && _states.isEmpty
                    ? AppEmptyState(
                        title: t.t('cases.feed.emptyTitle'),
                        message: t.t('cases.feed.emptyMessage'),
                      )
                    : AppEmptyState(
                        icon: AppIcons.filterAltOffOutlined,
                        title: t.t('cases.feed.emptyFiltered'),
                        message: [
                          if (_category != null)
                            // ignore: prefer_if_elements_to_conditional_expressions
                            _category == kNotSureTopic
                                ? t.t('feed.topics.notSure')
                                : topicName(ref, _category!),
                          if (mine) t.t('cases.feed.allLicensedStates'),
                          for (final c in codes) usStateByCode(c)?.name ?? c,
                        ].join(' · '),
                        action: AppButton(
                          key: const ValueKey('cases-clear-filters'),
                          label: t.t('feed.filters.clear'),
                          variant: AppButtonVariant.secondary,
                          height: AppSizes.touchTarget,
                          onPressed: () => setState(() {
                            _category = null;
                            _states = {};
                          }),
                        ),
                      ),
                itemBuilder: (context, c, _) => FeedCaseCard(
                  item: c,
                  t: t,
                  formats: formats,
                  onTap: () => context.push(AppRoutes.caseDetail(c.id)),
                  feedHeight: height,
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
