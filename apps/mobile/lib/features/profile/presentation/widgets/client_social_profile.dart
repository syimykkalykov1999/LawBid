import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/features/chat/presentation/open_direct_chat.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
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
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/review_widgets.dart'
    show
        MapsReviewTile,
        ReviewBadge,
        ReviewSummaryPanel,
        showReportReasonSheet,
        showReviewReplySheet;
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart'
    show ProfilePostsGrid;
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart'
    show FollowButton;
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/social/social_routes.dart';
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
                  AppIcon(icon,
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
              AppIcon(AppIcons.locationOnOutlined,
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
              icon: AppIcons.editOutlined,
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
                  _Tab.posts, AppIcons.gridOnRounded, t.t('client.tab.posts')),
              if (p.canSeeReviews)
                tabButton(_Tab.reviews, AppIcons.starOutlineRounded,
                    t.t('client.tab.reviews')),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
      ),
    );

    return TabSwipe<_Tab>(
      value: tab,
      values: p.canSeeReviews ? _Tab.values : const [_Tab.posts],
      onChanged: (v) => setState(() => _tab = v),
      child: RefreshIndicator(
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
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final key = (
      clientId: clientId,
      rating: _stars,
      sort: _sort,
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
        photos: [
          for (final ph in mine?.photos ?? const <ReviewPhoto>[])
            (fileId: ph.fileId, url: ph.previewUrl),
        ],
        onSave: (rating, body, photoIds) => ref
            .read(clientReviewsRepositoryProvider)
            .saveOpen(clientId, rating: rating, body: body, photoIds: photoIds),
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
              AppIcon(AppIcons.infoOutlineRounded,
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
                  ? AppIcons.rateReviewOutlined
                  : AppIcons.editOutlined,
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
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide,
                  AppSpacing.md, AppSpacing.screenSide, 0),
              // Owner 2026-10-01: laid out like a Google Maps review.
              child: MapsReviewTile(
                id: r.id,
                authorName: r.attorneyName,
                authorAvatarUrl: r.attorneyAvatarUrl,
                authorReviewCount: r.authorReviewCount,
                rating: r.rating,
                createdAt: r.createdAt,
                edited: r.editedAt != null,
                body: r.body,
                photos: r.photos,
                badges: [
                  if (r.caseId != null)
                    ReviewBadge(
                      label: t.t('reviews.badge.case'),
                      icon: AppIcons.verifiedRounded,
                    ),
                  ReviewBadge(label: t.t('reviews.role.${r.authorRole}')),
                ],
                helpfulCount: r.helpfulCount,
                helpfulByMe: r.helpfulByMe,
                onHelpful:
                    r.isMine || r.canReply ? null : () => _helpful(r, refresh),
                reply: r.reply,
                replyAt: r.replyAt,
                replyLabel: t.t('reviews.reply.fromPerson'),
                onEditReply: r.canReply ? () => _reply(r, refresh) : null,
                onDeleteReply:
                    r.canReply ? () => _deleteReply(r, refresh) : null,
                onMenu: () => _reviewMenu(r, refresh, write),
                onAuthor: () => context.push(r.authorIsClient
                    ? AppRoutes.client(r.attorneyUsername)
                    : AppRoutes.lawyer(r.attorneyUsername)),
              ),
            ),
        ],
      ),
    );
  }
}

extension on _ReviewsListState {
  Future<void> _reviewMenu(
    ClientReview r,
    VoidCallback refresh,
    Future<void> Function() write,
  ) async {
    final t = ref.read(translatorProvider);
    final choice = await showAppBottomSheet<String>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            if (r.canReply && r.reply == null)
              AppListRow(
                key: const ValueKey('client-review-reply'),
                icon: AppIcons.replyRounded,
                label: t.t('reviews.reply.action'),
                onTap: () => Navigator.of(sheet).pop('reply'),
              ),
            if (r.isMine) ...[
              AppListRow(
                icon: AppIcons.editOutlined,
                label: t.t('reviews.edit'),
                onTap: () => Navigator.of(sheet).pop('edit'),
              ),
              AppListRow(
                icon: AppIcons.deleteOutlineRounded,
                label: t.t('client.reviews.delete'),
                destructive: true,
                onTap: () => Navigator.of(sheet).pop('delete'),
              ),
            ] else
              AppListRow(
                key: const ValueKey('client-review-report'),
                icon: AppIcons.flagOutlined,
                label: t.t('reviews.report.action'),
                onTap: () => Navigator.of(sheet).pop('report'),
              ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
    if (!mounted || choice == null) return;
    final repo = ref.read(clientReviewsRepositoryProvider);
    switch (choice) {
      case 'reply':
        await _reply(r, refresh);
      case 'edit':
        await write();
      case 'delete':
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
      case 'report':
        final reason = await showReportReasonSheet(context, t);
        if (reason == null || !mounted) return;
        try {
          await repo.report(r.id, reason);
          if (mounted) showAppSnackBar(context, t.t('reviews.report.sent'));
        } on Object catch (e) {
          if (mounted) showAppSnackBar(context, errorText(t, e));
        }
    }
  }

  Future<void> _reply(ClientReview r, VoidCallback refresh) async {
    final t = ref.read(translatorProvider);
    final text = await showReviewReplySheet(context, initial: r.reply ?? '');
    if (text == null || !mounted) return;
    try {
      await ref.read(clientReviewsRepositoryProvider).reply(r.id, text);
      refresh();
      if (mounted) showAppSnackBar(context, t.t('reviews.reply.saved'));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _deleteReply(ClientReview r, VoidCallback refresh) async {
    final t = ref.read(translatorProvider);
    try {
      await ref.read(clientReviewsRepositoryProvider).reply(r.id, null);
      refresh();
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _helpful(ClientReview r, VoidCallback refresh) async {
    final t = ref.read(translatorProvider);
    try {
      await ref
          .read(clientReviewsRepositoryProvider)
          .helpful(r.id, on: !r.helpfulByMe);
      refresh();
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }
}
