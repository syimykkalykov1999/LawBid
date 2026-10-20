import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/cases/presentation/widgets/client_review_sheet.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/chat/presentation/open_direct_chat.dart';
import 'package:lawbid/features/profile/data/client_reviews_repository.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_quiet_button.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_tab_pages.dart';
import 'package:lawbid/features/profile/presentation/widgets/review_widgets.dart'
    show
        MapsReviewTile,
        ReviewBadge,
        ReviewSummaryPanel,
        showReportReasonSheet,
        showReviewReplySheet;
import 'package:lawbid/features/social/application/social_providers.dart'
    show currentUserIdProvider;
import 'package:lawbid/features/social/presentation/screens/social_screens.dart'
    show ProfileBriefsAndReposts, ProfilePostsGrid;
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart'
    show FollowButton, TrustAvatarBadge;
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/social/social_routes.dart';
import 'package:lawbid/features/stars/presentation/gift_widgets.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/shared/presentation/share_sheet.dart';

// Owner 2026-10-18: Instagram's tabs, as on an attorney's profile — Посты
// (photo posts) | Рилсы (video posts / reels) | Брифы и репосты | Отзывы
// (reviews about the client, only for those who may read them).
enum _Tab { posts, reels, reposts, reviews }

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

  /// The tab pages (set by the tab row): a tap glides to its page.
  PageController? _pages;

  void _open(_Tab value) {
    final tabs = p.canSeeReviews
        ? _Tab.values
        : const [_Tab.posts, _Tab.reels, _Tab.reposts];
    final i = tabs.indexOf(value);
    final pages = _pages;
    if (pages != null && pages.hasClients && i >= 0) {
      pages.animateToPage(
        i,
        duration: context.reduceMotion
            ? Duration.zero
            : const Duration(milliseconds: 250),
        curve: Curves.easeOutCubic,
      );
    } else {
      setState(() => _tab = value);
    }
  }

  PublicClientProfile get p => widget.profile;

  Future<void> _share(Translator t) async {
    final host = ref.read(appEnvironmentProvider).deepLinkHost;
    await showShareSheet(
      context,
      t: t,
      link: 'https://$host/client/${p.username}',
      text: atHandle(p.username),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final name = p.fullName.isEmpty ? atHandle(p.username) : p.fullName;
    final tab = p.canSeeReviews || _tab != _Tab.reviews ? _tab : _Tab.posts;
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
                    Text(
                      value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
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
            key: ValueKey('client-tab-${value.name}'),
            onTap: () => _open(value),
            // Owner 2026-10-18: four tabs — icons only, as on an attorney's
            // profile and Instagram (the label stays for screen readers).
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
              child: Center(
                child: AppIcon(
                  icon,
                  size: AppSizes.iconMd,
                  color: selected ? colors.text : colors.textSecondary,
                ),
              ),
            ),
          ),
        ),
      );
    }

    final header = Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              // Owner 2026-10-16: the verified badge sits on the avatar
              // corner (as on the attorney's), not beside the name.
              TrustAvatarBadge(
                id: p.id,
                size: AppSizes.profileAvatar,
                trustLevel: 0,
                goldLabel: p.verified ? t.t('profile.verified.label') : null,
                child: ProfileAvatar(
                  size: AppSizes.profileAvatar,
                  url: p.avatarUrl,
                  initials: initialsOf(
                    p.firstName,
                    p.lastName,
                    fallback: p.username,
                  ),
                  semanticLabel: t.t('profile.avatar.label'),
                  viewerCloseLabel: t.t('common.close'),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              counter(
                SocialFormat.count(f, p.postsCount),
                t.t('client.counter.posts'),
              ),
              counter(
                SocialFormat.count(f, p.followersCount),
                t.t('client.counter.followers'),
                onTap: () => context.push(SocialRoutes.followers(p.id)),
              ),
              counter(
                SocialFormat.count(f, p.followingCount),
                t.t('client.counter.following'),
                onTap: () => context.push(SocialRoutes.following(p.id)),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Flexible(
                child: Semantics(
                  header: true,
                  child: Text(
                    name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: type.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
          if (blocked) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t(p.isBlocked ? 'block.byYou' : 'block.blockedYou'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
          ],
          // Owner 2026-10-20: gifts on the profile (flag `stars`).
          if (!blocked) GiftShowcase(userId: p.id, isMe: p.isSelf),
          const SizedBox(height: AppSpacing.md),
          if (p.isSelf)
            Row(
              children: [
                Expanded(
                  child: ProfileQuietButton(
                    label: t.t('profile.action.edit'),
                    onTap: () => context.push(AppRoutes.profileEdit),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: ProfileQuietButton(
                    label: t.t('profile.action.shareProfile'),
                    onTap: () => _share(t),
                  ),
                ),
              ],
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
                // OQ-043: "Написать" opens the direct chat (a message
                // request until accepted). Owner 2026-10-17: clients too,
                // like Instagram. Audit 2026-10-02: assistants need the
                // "chats" duty.
                if (!ref.watch(actsAsAttorneyProvider) ||
                    ref.watch(canDoProvider(AssistantDuty.chats))) ...[
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: ProfileQuietButton(
                      label: t.t('profile.action.message'),
                      onTap: () => openDirectChat(context, ref, p.id),
                    ),
                  ),
                ],
              ],
            ),
          const SizedBox(height: AppSpacing.md),
        ],
      ),
    );

    final tabs = p.canSeeReviews
        ? _Tab.values
        : const [_Tab.posts, _Tab.reels, _Tab.reposts];
    Widget pageOf(_Tab value) => switch (value) {
          _Tab.posts => ProfilePostsGrid(
              attorneyId: p.id,
              emptyTitle: t.t('client.posts.empty'),
              emptyMessage: '',
            ),
          _Tab.reels => ProfilePostsGrid(
              key: const ValueKey('reels'),
              attorneyId: p.id,
              reelsOnly: true,
              emptyTitle: t.t('profile.reels.empty.title'),
              emptyMessage: t.t(
                p.isSelf
                    ? 'profile.reels.empty.self'
                    : 'profile.reels.empty.other',
              ),
            ),
          _Tab.reposts => ProfileBriefsAndReposts(
              attorneyId: p.id,
              isSelf: p.isSelf,
              emptyOtherKey: 'profile.briefsReposts.empty.otherUser',
            ),
          _Tab.reviews => _ReviewsList(clientId: p.id),
        };

    // Owner 2026-10-19 (Instagram): the header scrolls away, the tabs stick
    // and are pages side by side (swipe / tap glide), each kept alive — no
    // blink, no jump when a tab changes.
    return ProfileTabPages(
      initialPage: tabs.indexOf(tab).clamp(0, tabs.length - 1),
      onPage: (i) => setState(() => _tab = tabs[i]),
      header: header,
      tabBar: Builder(
        builder: (context) {
          _pages = ProfileTabPages.controllerOf(context);
          return Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenSide,
            ),
            child: Row(
              children: [
                tabButton(
                  _Tab.posts,
                  AppIcons.gridOnRounded,
                  t.t('client.tab.posts'),
                ),
                tabButton(
                  _Tab.reels,
                  AppIcons.playCircleOutlined,
                  t.t('profile.tab.reels'),
                ),
                // Owner 2026-10-18: the same «Брифы и репосты» tab as an
                // attorney's (a client's text posts had no tab before).
                tabButton(
                  _Tab.reposts,
                  AppIcons.autoModeRounded,
                  t.t('profile.tab.briefsReposts'),
                ),
                if (p.canSeeReviews)
                  tabButton(
                    _Tab.reviews,
                    AppIcons.starOutlineRounded,
                    t.t('client.tab.reviews'),
                  ),
              ],
            ),
          );
        },
      ),
      pagePadding: (_) => const EdgeInsets.only(
        top: AppSpacing.sm,
        bottom: AppSpacing.xxl,
      ),
      onRefresh: () async {
        ref
          ..invalidate(clientReviewsProvider)
          ..invalidate(clientReviewSummaryProvider(p.id));
        await widget.onRefresh();
      },
      pages: [
        for (final value in tabs)
          ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: MediaQuery.sizeOf(context).height * 0.5,
            ),
            child: pageOf(value),
          ),
      ],
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
      if ((saved ?? false) && context.mounted) {
        refresh();
        showAppSnackBar(context, t.t('client.review.saved'));
      }
    }

    final note = Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.sm,
        AppSpacing.screenSide,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppIcon(
                AppIcons.infoOutlineRounded,
                size: AppSizes.iconSm,
                color: colors.goldDark,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  t.t(
                    isSelf
                        ? 'client.reviews.selfNote'
                        : 'client.reviews.publicNote',
                  ),
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              ),
            ],
          ),
          if (!isSelf) ...[
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: t.t(
                mine == null
                    ? 'client.reviews.write'
                    : 'client.reviews.editMine',
              ),
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
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        0,
      ),
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
              child: Text(
                t.t('client.reviews.empty'),
                textAlign: TextAlign.center,
                style: type.body.copyWith(color: colors.textSecondary),
              ),
            ),
          for (final r in page.items)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                AppSpacing.md,
                AppSpacing.screenSide,
                0,
              ),
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
                      icon: AppIcons.verifiedUserOutlined,
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
                onAuthor: () => context.push(
                  r.authorIsClient
                      ? AppRoutes.client(r.attorneyUsername)
                      : AppRoutes.lawyer(r.attorneyUsername),
                ),
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
                destructive: true,
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
