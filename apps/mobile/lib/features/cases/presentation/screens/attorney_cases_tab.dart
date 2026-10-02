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
/// filters by own practice / own licensed state, and the gate states:
/// not verified, no practices, no verified license.
class AttorneyCasesTab extends ConsumerStatefulWidget {
  const AttorneyCasesTab({super.key});

  @override
  ConsumerState<AttorneyCasesTab> createState() => _AttorneyCasesTabState();
}

class _AttorneyCasesTabState extends ConsumerState<AttorneyCasesTab> {
  /// Practice category from the topic slider (null = all).
  String? _category;
  String? _state;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    if (ref.watch(attorneyNeedsVerificationProvider)) {
      return const VerificationRequiredView(
        reason: VerificationGateReason.cases,
      );
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
    if (!practices.hasValue || !profile.hasValue) {
      return const CasesListSkeleton();
    }

    final myPractices = practices.requireValue;
    final licensed = [
      for (final l in profile.requireValue.licenses)
        if (l.status == LicenseState.verified) l.state.code,
    ];
    if (licensed.isEmpty) {
      return AppEmptyState(
        icon: AppIcons.workspacePremiumOutlined,
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
        icon: AppIcons.balanceRounded,
        title: t.t('cases.feed.noPracticesTitle'),
        message: t.t('cases.feed.noPracticesMessage'),
        action: AppButton(
          label: t.t('cases.feed.choosePractices'),
          height: AppSizes.touchTarget,
          onPressed: () => context.push(AppRoutes.practices),
        ),
      );
    }

    final filter = (practiceCategory: _category, state: _state);
    final value = ref.watch(caseFeedProvider(filter));
    final n = ref.read(caseFeedProvider(filter).notifier);

    // Owner 2026-09-30 (OQ-034): the same topic slider and filter as the
    // post feed; one case card fills the screen down to the nav bar.
    return Column(
      children: [
        TopicFilterBar(
          category: _category,
          onCategory: (v) => setState(() => _category = v),
          stateCode: _state,
          onState: (v) => setState(() => _state = v),
          showNews: false,
          showNotSure: true,
          allowedStates: licensed,
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
                empty: _category == null && _state == null
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
                          if (_state != null)
                            usStateByCode(_state)?.name ?? _state!,
                        ].join(' · '),
                        action: AppButton(
                          key: const ValueKey('cases-clear-filters'),
                          label: t.t('feed.filters.clear'),
                          variant: AppButtonVariant.secondary,
                          height: AppSizes.touchTarget,
                          onPressed: () => setState(() {
                            _category = null;
                            _state = null;
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
