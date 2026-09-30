import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/profile/data/client_reviews_repository.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart'
    show ReviewsSort;
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/review_widgets.dart'
    show ReviewSummaryPanel;
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart'
    show ProfilePostsGrid;
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart'
    show FollowButton;
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/social/social_routes.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

enum _Tab { posts, reviews }

/// Owner 2026-09-30 (OQ-038): the client profile like Instagram, for the
/// client and for anyone opening it — avatar with posts / followers /
/// following, name, state, Edit or Follow, then two tabs: Posts and Reviews. Reviews
/// (attorneys about this client) are shown only to attorneys and the
/// client themself.
class ClientSocialProfile extends ConsumerStatefulWidget {
  const ClientSocialProfile({
    required this.profile,
    required this.onRefresh,
    super.key,
  });

  final PublicClientProfile profile;
  final Future<void> Function() onRefresh;

  @override
  ConsumerState<ClientSocialProfile> createState() =>
      _ClientSocialProfileState();
}

class _ClientSocialProfileState extends ConsumerState<ClientSocialProfile> {
  _Tab _tab = _Tab.posts;

  PublicClientProfile get p => widget.profile;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final name = p.fullName.isEmpty ? '@${p.username}' : p.fullName;
    final tab = p.canSeeReviews ? _tab : _Tab.posts;
    final blocked = p.isBlocked || p.hasBlockedMe;

    Widget counter(String value, String label, {VoidCallback? onTap}) =>
        Expanded(
          child: Semantics(
            label: '$value $label',
            button: onTap != null,
            excludeSemantics: true,
            child: AppPressable(
              onTap: onTap ?? () {},
              child: ConstrainedBox(
                constraints:
                    const BoxConstraints(minHeight: AppSizes.touchTarget),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Owner 2026-09-30: the same size as the attorney's
                    // counters, not a big title.
                    Text(value,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.body.copyWith(
                            color: colors.text, fontWeight: FontWeight.w700)),
                    Text(label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style:
                            type.caption.copyWith(color: colors.textSecondary)),
                  ],
                ),
              ),
            ),
          ),
        );

    Widget tabButton(_Tab value, IconData icon, String label) {
      final selected = tab == value;
      return Expanded(
        child: Semantics(
          button: true,
          selected: selected,
          label: label,
          excludeSemantics: true,
          child: AppPressable(
            onTap: () => setState(() => _tab = value),
            child: Container(
              height: AppSizes.touchTarget,
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(
                    color: selected ? colors.gold : colors.border,
                    width: selected ? 2 : 1,
                  ),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon,
                      size: 20,
                      color: selected ? colors.text : colors.textSecondary),
                  const SizedBox(width: AppSpacing.xs),
                  Text(label,
                      style: type.bodySmall.copyWith(
                          color: selected ? colors.text : colors.textSecondary,
                          fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ),
        ),
      );
    }

    final header = Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide, AppSpacing.md, AppSpacing.screenSide, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              ProfileAvatar(
                size: 88,
                url: p.avatarUrl,
                initials:
                    initialsOf(p.firstName, p.lastName, fallback: p.username),
                semanticLabel: t.t('profile.avatar.label'),
              ),
              const SizedBox(width: AppSpacing.md),
              counter(SocialFormat.count(f, p.postsCount),
                  t.t('client.counter.posts')),
              counter(SocialFormat.count(f, p.followersCount),
                  t.t('client.counter.followers'),
                  onTap: () => context.push(SocialRoutes.followers(p.id))),
              counter(SocialFormat.count(f, p.followingCount),
                  t.t('client.counter.following'),
                  onTap: () => context.push(SocialRoutes.following(p.id))),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Flexible(
                child: Semantics(
                  header: true,
                  child: Text(name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(
                          color: colors.text, fontWeight: FontWeight.w700)),
                ),
              ),
              if (p.verified) ...[
                const SizedBox(width: AppSpacing.xs),
                VerifiedBadge(semanticLabel: t.t('profile.verified.label')),
              ],
            ],
          ),
          const SizedBox(height: 2),
          Row(
            children: [
              Icon(Icons.location_on_outlined,
                  size: AppSpacing.lg, color: colors.goldStroke),
              const SizedBox(width: AppSpacing.xs),
              Flexible(
                child: Text(
                  '${t.t('person.client')} · ${p.state.name}',
                  style: type.bodySmall.copyWith(color: colors.textSecondary),
                ),
              ),
            ],
          ),
          if (blocked) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(t.t(p.isBlocked ? 'block.byYou' : 'block.blockedYou'),
                style: type.bodySmall.copyWith(color: colors.textSecondary)),
          ],
          const SizedBox(height: AppSpacing.md),
          if (p.isSelf)
            AppButton(
              label: t.t('profile.action.edit'),
              icon: Icons.edit_outlined,
              variant: AppButtonVariant.secondary,
              height: AppSizes.touchTarget,
              onPressed: () => context.push(AppRoutes.profileEdit),
            )
          else if (!blocked)
            FollowButton(
              attorneyId: p.id,
              initial: p.isFollowing,
              expanded: true,
            ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              tabButton(
                  _Tab.posts, Icons.grid_on_rounded, t.t('client.tab.posts')),
              if (p.canSeeReviews)
                tabButton(_Tab.reviews, Icons.star_outline_rounded,
                    t.t('client.tab.reviews')),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
      ),
    );

    return RefreshIndicator(
      color: colors.gold,
      onRefresh: () async {
        ref
          ..invalidate(clientReviewsProvider)
          ..invalidate(clientReviewSummaryProvider(p.id));
        await widget.onRefresh();
      },
      child: ListView(
        padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
        children: [
          header,
          if (tab == _Tab.posts)
            ProfilePostsGrid(
              attorneyId: p.id,
              emptyTitle: t.t('client.posts.empty'),
              emptyMessage: '',
            )
          else
            _ReviewsList(clientId: p.id),
        ],
      ),
    );
  }
}

/// The Reviews tab like the attorney's: average, count and the 5 → 1 bars
/// (tap a bar to show only those reviews — good or bad ones), date order
/// in the corner, then the reviews (owner 2026-09-30).
class _ReviewsList extends ConsumerStatefulWidget {
  const _ReviewsList({required this.clientId});

  final String clientId;

  @override
  ConsumerState<_ReviewsList> createState() => _ReviewsListState();
}

class _ReviewsListState extends ConsumerState<_ReviewsList> {
  int? _stars;
  ReviewsSort _sort = ReviewsSort.newest;

  String get clientId => widget.clientId;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final key = (
      clientId: clientId,
      rating: _stars,
      oldest: _sort == ReviewsSort.oldest,
    );
    final value = ref.watch(clientReviewsProvider(key));
    final summary = ref.watch(clientReviewSummaryProvider(clientId)).value ??
        const ReviewSummary.empty();
    final note = Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide, AppSpacing.sm, AppSpacing.screenSide, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.lock_outline_rounded,
              size: AppSizes.iconSm, color: colors.goldDark),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(t.t('client.reviews.private'),
                style: type.caption.copyWith(color: colors.textSecondary)),
          ),
        ],
      ),
    );
    final panel = Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide, AppSpacing.md, AppSpacing.screenSide, 0),
      child: ReviewSummaryPanel(
        summary: summary,
        selectedStars: _stars,
        onStarsTap: (stars) =>
            setState(() => _stars = _stars == stars ? null : stars),
        sort: _sort,
        onSort: (sort) => setState(() => _sort = sort),
      ),
    );
    return value.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(AppSpacing.screenSide),
        child: AppSkeleton(height: 120),
      ),
      error: (_, __) => Center(
        child: TextButton(
          onPressed: () => ref.invalidate(clientReviewsProvider(key)),
          child: Text(t.t('error.retry')),
        ),
      ),
      data: (page) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          note,
          panel,
          if (page.items.isEmpty)
            Padding(
              padding: const EdgeInsets.all(AppSpacing.xxl),
              child: Text(t.t('client.reviews.empty'),
                  textAlign: TextAlign.center,
                  style: type.body.copyWith(color: colors.textSecondary)),
            ),
          for (final r in page.items)
            Container(
              margin: const EdgeInsets.fromLTRB(AppSpacing.screenSide,
                  AppSpacing.md, AppSpacing.screenSide, 0),
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.card),
                border: Border.all(color: colors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppPressable(
                    onTap: () =>
                        context.push(AppRoutes.lawyer(r.attorneyUsername)),
                    child: Row(
                      children: [
                        GoldRingAvatar(
                          url: r.attorneyAvatarUrl,
                          initials: r.attorneyName.isEmpty
                              ? '?'
                              : r.attorneyName[0].toUpperCase(),
                          size: 40,
                          ring: r.attorneyVerified,
                        ),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(r.attorneyName,
                                  style: type.bodySmall.copyWith(
                                      color: colors.text,
                                      fontWeight: FontWeight.w600)),
                              Text(f.date(r.createdAt),
                                  style: type.caption
                                      .copyWith(color: colors.textSecondary)),
                            ],
                          ),
                        ),
                        Row(
                          children: [
                            for (var i = 1; i <= 5; i++)
                              Icon(
                                i <= r.rating
                                    ? Icons.star_rounded
                                    : Icons.star_outline_rounded,
                                size: 18,
                                color: colors.gold,
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if ((r.body ?? '').isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Text(r.body!,
                        style: type.body.copyWith(color: colors.text)),
                  ],
                  const SizedBox(height: AppSpacing.sm),
                  Text(t.t('client.review.case', {'title': r.caseTitle}),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style:
                          type.caption.copyWith(color: colors.textSecondary)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
