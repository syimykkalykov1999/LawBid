import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/features/chat/presentation/open_direct_chat.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/features/cases/presentation/widgets/client_review_sheet.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/social/application/social_providers.dart'
    show currentUserIdProvider;
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
import 'package:lawbid/features/team/application/team_providers.dart';

enum _Tab { posts, reviews }

/// Owner 2026-09-30 (OQ-038): the client profile like Instagram, for the
/// client and for anyone opening it — avatar with posts / followers /
/// following, name, state, Edit or Follow, then two tabs: Posts and Reviews.
/// Owner 2026-09-30: anyone — attorney or client — may review a client to
/// warn others and everyone signed in reads them; the author edits or
/// deletes theirs; the client appeals one through "…".
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
            Row(
              children: [
                Expanded(
                  child: FollowButton(
                    attorneyId: p.id,
                    initial: p.isFollowing,
                    expanded: true,
                  ),
                ),
                // OQ-043: an attorney can write to a client directly (a
                // message request until the client accepts).
                if (ref.watch(actsAsAttorneyProvider)) ...[
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: AppButton(
                      label: t.t('profile.action.message'),
                      variant: AppButtonVariant.secondary,
                      height: AppSizes.touchTarget,
                      onPressed: () => openDirectChat(context, ref, p.id),
                    ),
                  ),
                ],
              ],
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
    final me = ref.watch(currentUserIdProvider);
    final isSelf = me == clientId;
    final mine =
        isSelf ? null : ref.watch(myOpenClientReviewProvider(clientId)).value;
    void refresh() {
      ref
        ..invalidate(clientReviewsProvider)
        ..invalidate(clientReviewSummaryProvider(clientId))
        ..invalidate(myOpenClientReviewProvider(clientId));
    }

    Future<void> write() async {
      final saved = await showClientReviewSheet(
        context,
        rating: mine?.rating ?? 0,
        body: mine?.body ?? '',
        onSave: (rating, body) => ref
            .read(clientReviewsRepositoryProvider)
            .saveOpen(clientId, rating: rating, body: body),
      );
      if (saved == true && context.mounted) {
        refresh();
        showAppSnackBar(context, t.t('client.review.saved'));
      }
    }

    final note = Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide, AppSpacing.sm, AppSpacing.screenSide, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline_rounded,
                  size: AppSizes.iconSm, color: colors.goldDark),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                    t.t(isSelf
                        ? 'client.reviews.selfNote'
                        : 'client.reviews.publicNote'),
                    style: type.caption.copyWith(color: colors.textSecondary)),
              ),
            ],
          ),
          if (!isSelf) ...[
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: t.t(mine == null
                  ? 'client.reviews.write'
                  : 'client.reviews.editMine'),
              icon: mine == null
                  ? Icons.rate_review_outlined
                  : Icons.edit_outlined,
              variant: mine == null
                  ? AppButtonVariant.primary
                  : AppButtonVariant.secondary,
              height: AppSizes.touchTarget,
              onPressed: write,
            ),
          ],
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
                    onTap: () => context.push(r.authorIsClient
                        ? AppRoutes.client(r.attorneyUsername)
                        : AppRoutes.lawyer(r.attorneyUsername)),
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
                        // Owner 2026-09-30: "…" — delete my review, or
                        // appeal one about me.
                        if (r.isMine || r.canAppeal)
                          AppIconButton(
                            plain: true,
                            icon: Icon(Icons.more_horiz_rounded,
                                color: colors.textSecondary),
                            semanticLabel: t.t('client.reviews.menu'),
                            onPressed: () => _reviewMenu(r, refresh),
                          ),
                      ],
                    ),
                  ),
                  if (r.appealStatus != null) ...[
                    const SizedBox(height: AppSpacing.sm),
                    _AppealChip(status: r.appealStatus!),
                  ],
                  if ((r.body ?? '').isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Text(r.body!,
                        style: type.body.copyWith(color: colors.text)),
                  ],
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                      r.caseTitle != null
                          ? t.t('client.review.case', {'title': r.caseTitle!})
                          : t.t(r.authorIsClient
                              ? 'client.review.byClient'
                              : 'client.review.byAttorney'),
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

extension on _ReviewsListState {
  Future<void> _reviewMenu(ClientReview r, VoidCallback refresh) async {
    final t = ref.read(translatorProvider);
    final choice = await showAppBottomSheet<String>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            if (r.isMine)
              AppListRow(
                icon: Icons.delete_outline_rounded,
                label: t.t('client.reviews.delete'),
                destructive: true,
                onTap: () => Navigator.of(sheet).pop('delete'),
              ),
            if (r.canAppeal)
              AppListRow(
                icon: Icons.gavel_rounded,
                label: t.t('client.reviews.appeal'),
                onTap: () => Navigator.of(sheet).pop('appeal'),
              ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
    if (!mounted || choice == null) return;
    final repo = ref.read(clientReviewsRepositoryProvider);
    if (choice == 'delete') {
      final ok = await showConfirmSheet(
        context,
        t: t,
        title: t.t('client.reviews.deleteTitle'),
        message: t.t('client.reviews.deleteMessage'),
        confirmLabel: t.t('client.reviews.delete'),
        destructive: true,
      );
      if (!ok) return;
      try {
        await repo.delete(r.id);
        refresh();
        if (mounted) showAppSnackBar(context, t.t('client.reviews.deleted'));
      } on Object catch (e) {
        if (mounted) showAppSnackBar(context, errorText(t, e));
      }
      return;
    }
    final reason = await showAppBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _AppealSheet(),
    );
    if (reason == null || reason.trim().isEmpty || !mounted) return;
    try {
      await repo.appeal(r.id, reason);
      refresh();
      if (mounted) showAppSnackBar(context, t.t('client.reviews.appealSent'));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }
}

/// Why the review should go (sent to the moderators).
class _AppealSheet extends ConsumerStatefulWidget {
  const _AppealSheet();

  @override
  ConsumerState<_AppealSheet> createState() => _AppealSheetState();
}

class _AppealSheetState extends ConsumerState<_AppealSheet> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AppSheetHandle(),
          Text(t.t('client.reviews.appealTitle'),
              style: type.titleMedium.copyWith(color: colors.text)),
          const SizedBox(height: AppSpacing.xs),
          Text(t.t('client.reviews.appealHint'),
              style: type.bodySmall.copyWith(color: colors.textSecondary)),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            controller: _text,
            hintText: t.t('client.reviews.appealReason'),
            semanticLabel: t.t('client.reviews.appealReason'),
            maxLength: 1000,
            maxLines: 5,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: t.t('client.reviews.appealSend'),
            height: AppSizes.touchTarget,
            onPressed: _text.text.trim().isEmpty
                ? null
                : () => Navigator.of(context).pop(_text.text),
          ),
        ],
      ),
    );
  }
}

/// "Under review by moderators" / "Kept" on an appealed review.
class _AppealChip extends ConsumerWidget {
  const _AppealChip({required this.status});

  final String status;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding:
            const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 2),
        decoration: BoxDecoration(
          color: colors.goldTint,
          borderRadius: BorderRadius.circular(AppRadii.pill),
        ),
        child: Text(
          t.t('client.reviews.appeal.$status'),
          style: type.caption.copyWith(color: colors.goldDark),
        ),
      ),
    );
  }
}
