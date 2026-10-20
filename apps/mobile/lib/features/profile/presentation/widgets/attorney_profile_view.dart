import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/blocks/presentation/block_actions.dart';
import 'package:lawbid/features/cases/presentation/widgets/client_review_sheet.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/cases/presentation/widgets/offer_case_sheet.dart';
import 'package:lawbid/features/chat/presentation/open_direct_chat.dart';
import 'package:lawbid/features/consultations/application/consultations_providers.dart';
import 'package:lawbid/features/consultations/presentation/booking_sheet.dart';
import 'package:lawbid/features/feed/application/news_flag.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_banners.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_quiet_button.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_tab_pages.dart';
import 'package:lawbid/features/profile/presentation/widgets/review_widgets.dart';
import 'package:lawbid/features/social/domain/social_models.dart'
    show ReportTarget;
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart'
    show showReportSheet;
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/social/social_routes.dart';
import 'package:lawbid/features/stars/presentation/gift_widgets.dart';
import 'package:lawbid/features/stories/presentation/story_avatar_ring.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/translation/data/content_translation_repository.dart';
import 'package:lawbid/features/translation/presentation/translatable_text.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:lawbid/shared/presentation/share_sheet.dart';

// Owner 2026-09-30: News — the attorney's news posts, apart.
// Owner 2026-10-18: three tabs — Posts | Briefs & reposts | Reviews (plus
// News while it is on). [threads] has no tab of its own any more: opening
// it lands on [reposts], the merged «Брифы и репосты» tab.
// Owner 2026-10-18 (later): Instagram's tabs for everyone — Посты (photo
// posts) | Рилсы (video posts / reels) | Брифы и репосты | Отзывы (plus
// News while it is on, before Reviews).
enum AttorneyProfileTab { posts, reels, threads, reposts, news, reviews }

/// Public link of an attorney profile (docs/03 §4.2 «Поделиться», deep
/// link of docs/01 §12).
String attorneyShareLink(String host, String username) =>
    'https://$host/lawyer/$username';

/// docs/03 §4.2 attorney profile, top to bottom: header (photo, @username
/// + blue check, counters) → gold rating card → "Attorney" chip + bio →
/// chip rows (firm, practices, licensed states) → buttons → Posts /
/// Reviews tabs. The same view serves the caller's own profile ([profile]
/// `.isSelf`: Edit + Share) and anyone else's (Follow + Message + Share;
/// "Message" opens the Chats screen — chats start from a case, docs/04 §9).
class AttorneyProfileView extends ConsumerStatefulWidget {
  const AttorneyProfileView({
    required this.profile,
    required this.onRefresh,
    super.key,
    this.needsVerification = false,
    this.initialTab = AttorneyProfileTab.posts,
  });

  final PublicAttorneyProfile profile;
  final Future<void> Function() onRefresh;

  /// Own profile of an attorney who is not verified yet: shows the
  /// "Complete verification" banner.
  final bool needsVerification;
  final AttorneyProfileTab initialTab;

  @override
  ConsumerState<AttorneyProfileView> createState() =>
      _AttorneyProfileViewState();
}

/// "⋯" on someone else's profile: Block / Unblock, Report (OQ-028). Owner
/// 2026-09-30: opened from the top bar, opposite the @username.
Future<void> showAttorneyMoreSheet(
  BuildContext context,
  WidgetRef ref,
  PublicAttorneyProfile p,
) async {
  final t = ref.read(translatorProvider);
  await showAppBottomSheet<void>(
    context: context,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const AppSheetHandle(),
          BlockListRow(
            userId: p.id,
            displayName: p.fullName.isEmpty ? atHandle(p.username) : p.fullName,
            currentlyBlocked: p.isBlocked,
            onChanged: () =>
                ref.invalidate(publicAttorneyProfileProvider(p.username)),
          ),
          AppListRow(
            icon: AppIcons.flagOutlined,
            label: t.t('post.menu.report'),
            destructive: true,
            showChevron: false,
            onTap: () {
              Navigator.of(sheet).pop();
              showReportSheet(context, ref, ReportTarget.user, p.id);
            },
          ),
          const SizedBox(height: AppSpacing.md),
        ],
      ),
    ),
  );
}

class _AttorneyProfileViewState extends ConsumerState<AttorneyProfileView> {
  late AttorneyProfileTab _picked = widget.initialTab;

  /// Owner 2026-10-06: without News (flag off) its tab is gone.
  /// Owner 2026-10-18: the briefs live in the Reposts tab (no Threads tab).
  List<AttorneyProfileTab> get _tabs => [
        for (final tab in AttorneyProfileTab.values)
          if (tab != AttorneyProfileTab.threads &&
              (tab != AttorneyProfileTab.news ||
                  ref.watch(newsEnabledProvider)))
            tab,
      ];

  AttorneyProfileTab get _tab {
    final picked = _picked == AttorneyProfileTab.threads
        ? AttorneyProfileTab.reposts
        : _picked;
    return _tabs.contains(picked) ? picked : AttorneyProfileTab.posts;
  }

  /// Reviews tab: star filter (null = all) and date order.
  int? _stars;
  ReviewsSort _sort = ReviewsSort.newest;

  PublicAttorneyProfile get p => widget.profile;
  ReviewsKey get _reviewsKey => (attorneyId: p.id, rating: _stars, sort: _sort);

  void _refreshReviews() => ref
    ..invalidate(reviewSummaryProvider(p.id))
    ..invalidate(reviewsListProvider)
    ..invalidate(myAttorneyReviewProvider(p.id));

  /// Owner 2026-10-06: a client who completed a case with this attorney
  /// writes / edits their review.
  Future<void> _writeReview(Translator t, Review? mine) async {
    final saved = await showClientReviewSheet(
      context,
      rating: mine?.rating ?? 0,
      body: mine?.body ?? '',
      titleKey: 'reviews.write.title',
      hintKey: 'reviews.write.hintCase',
      photos: [
        for (final ph in mine?.photos ?? const <ReviewPhoto>[])
          (fileId: ph.fileId, url: ph.previewUrl),
      ],
      onSave: (rating, body, photoIds) => ref
          .read(reviewsRepositoryProvider)
          .saveMine(p.id, rating: rating, body: body, photoIds: photoIds),
    );
    if ((saved ?? false) && mounted) {
      _refreshReviews();
      showAppSnackBar(context, t.t('reviews.write.saved'));
    }
  }

  Future<void> _deleteReview(Translator t, Review review) async {
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('client.reviews.deleteTitle'),
      message: t.t('client.reviews.deleteMessage'),
      confirmLabel: t.t('client.reviews.delete'),
      destructive: true,
    );
    if (!ok || !mounted) return;
    try {
      await ref.read(reviewsRepositoryProvider).delete(review.id);
      _refreshReviews();
      if (mounted) showAppSnackBar(context, t.t('client.reviews.deleted'));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _reply(
    Translator t,
    Review review, {
    bool remove = false,
  }) async {
    final text = remove
        ? null
        : await showReviewReplySheet(context, initial: review.reply ?? '');
    if ((!remove && text == null) || !mounted) return;
    try {
      await ref.read(reviewsRepositoryProvider).reply(review.id, text);
      _refreshReviews();
      if (mounted && !remove) {
        showAppSnackBar(context, t.t('reviews.reply.saved'));
      }
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _helpful(Translator t, Review review) async {
    try {
      await ref
          .read(reviewsRepositoryProvider)
          .helpful(review.id, on: !review.helpfulByMe);
      ref.invalidate(reviewsListProvider);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _report(Translator t, Review review) async {
    final reason = await showReportReasonSheet(context, t);
    if (reason == null || !mounted) return;
    try {
      await ref.read(reviewsRepositoryProvider).report(review.id, reason);
      if (mounted) showAppSnackBar(context, t.t('reviews.report.sent'));
    } catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _share(Translator t) async {
    // Owner 2026-10-01: the LawBid share sheet (social networks too).
    final host = ref.read(appEnvironmentProvider).deepLinkHost;
    await showShareSheet(
      context,
      t: t,
      link: attorneyShareLink(host, p.username),
      text: p.fullName,
    );
  }

  /// The page of each tab (its own scroll list, kept alive).
  Widget _gridPage(Translator t, AttorneyProfileTab tab) =>
      tab == AttorneyProfileTab.reposts
          ? ProfileBriefsAndReposts(
              key: const ValueKey('reposts'),
              attorneyId: p.id,
              isSelf: p.isSelf,
            )
          : tab == AttorneyProfileTab.reels
              ? ProfilePostsGrid(
                  key: const ValueKey('reels'),
                  attorneyId: p.id,
                  reelsOnly: true,
                  emptyTitle: t.t('profile.reels.empty.title'),
                  emptyMessage: t.t(
                    p.isSelf
                        ? 'profile.reels.empty.self'
                        : 'profile.reels.empty.other',
                  ),
                )
              : tab == AttorneyProfileTab.news
                  ? ProfilePostsGrid(
                      key: const ValueKey('news'),
                      attorneyId: p.id,
                      newsOnly: true,
                      emptyTitle: t.t('profile.news.empty.title'),
                      emptyMessage: t.t(
                        p.isSelf
                            ? 'profile.news.empty.self'
                            : 'profile.news.empty.other',
                      ),
                    )
                  : ProfilePostsGrid(
                      attorneyId: p.id,
                      emptyTitle: t.t('profile.posts.empty.title'),
                      emptyMessage: t.t(
                        p.isSelf
                            ? 'profile.posts.empty.self'
                            : 'profile.posts.empty.other',
                      ),
                    );

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    // Owner 2026-10-19 (Instagram): every tab's data loads with the profile
    // and stays (no load, blink or jump when a tab is opened).
    final reviews = ref.watch(reviewsListProvider(_reviewsKey));
    final summary = ref.watch(reviewSummaryProvider(p.id));
    final state = reviews.value;
    final tabs = _tabs;

    // Owner 2026-10-19: the header is the same for every tab, with no
    // entrance animation — it never moves when a tab changes.
    final header = Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.sm,
        AppSpacing.screenSide,
        AppSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.needsVerification) ...[
            _VerificationBanner(t: t),
            const SizedBox(height: AppSpacing.md),
          ],
          // Instagram-like: avatar + counters (posts, followers, following,
          // ★ rating → reviews), name, bio, info chips, one compact button
          // row, icon tabs (owner request 2026-09-28).
          _HeaderCard(profile: p),
          const SizedBox(height: AppSpacing.md),
          _AboutSection(profile: p),
          const SizedBox(height: AppSpacing.md),
          _ChipRows(profile: p),
          // Owner 2026-10-20: gifts on the profile (flag `stars`).
          if (!(p.isBlocked || p.hasBlockedMe))
            GiftShowcase(userId: p.id, isMe: p.isSelf),
          const SizedBox(height: AppSpacing.sm),
          // Instagram order: buttons right above the tabs — Follow |
          // Message | share icon (owner request).
          if (!p.isSelf && (p.isBlocked || p.hasBlockedMe)) ...[
            _BlockNotice(
              text: t.t(p.isBlocked ? 'block.byYou' : 'block.blockedYou'),
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          _Actions(
            isSelf: p.isSelf,
            attorneyId: p.id,
            isFollowing: p.isFollowing,
            blocked: p.isBlocked || p.hasBlockedMe,
            // OQ-043: "Написать" opens the direct chat (a message request
            // until accepted). Owner 2026-10-17: anyone writes to anyone;
            // an assistant needs the "chats" duty.
            canMessage: !ref.watch(actsAsAttorneyProvider) ||
                ref.watch(canDoProvider(AssistantDuty.chats)),
            onMessage: () => openDirectChat(context, ref, p.id),
            onShare: () => _share(t),
          ),
          // Owner 2026-10-05: a client offers one of their cases directly.
          if (!p.isSelf &&
              !(p.isBlocked || p.hasBlockedMe) &&
              ref.watch(currentUserRoleProvider) == UserRole.client) ...[
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              key: const ValueKey('profile-offer-case'),
              label: t.t('invite.offer.button'),
              icon: AppIcons.workOutlineRounded,
              height: 40,
              onPressed: () => showOfferCaseSheet(
                context,
                attorneyId: p.id,
                attorneyName: p.fullName.trim().isEmpty
                    ? atHandle(p.username)
                    : p.fullName,
                licensedStateCodes: {for (final s in p.licensedStates) s.code},
                practiceIds: {for (final x in p.practices) x.id},
              ),
            ),
          ],
          // Owner 2026-10-20: book a consultation (flag `consultations`,
          // the attorney switched booking on).
          if (!p.isSelf &&
              !(p.isBlocked || p.hasBlockedMe) &&
              p.consultationEnabled &&
              ref.watch(consultationsFlagProvider) &&
              ref.watch(currentUserRoleProvider) == UserRole.client) ...[
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              key: const ValueKey('profile-book-consultation'),
              label: t.t('consult.book'),
              icon: AppIcons.eventAvailableRounded,
              variant: AppButtonVariant.secondary,
              height: 40,
              onPressed: () => showConsultationBooking(
                context,
                attorneyId: p.id,
                attorneyName: p.fullName.trim().isEmpty
                    ? atHandle(p.username)
                    : p.fullName,
              ),
            ),
          ],
        ],
      ),
    );

    // The reviews tab: who may write, the summary, then the reviews.
    Widget? reviewsState;
    var status = AppPaginationStatus.idle;
    var items = const <Review>[];
    if (reviews.isLoading && state == null) {
      reviewsState = const Column(
        children: [
          ReviewCardSkeleton(),
          SizedBox(height: AppSpacing.md),
          ReviewCardSkeleton(),
        ],
      );
    } else if (reviews.hasError && state == null) {
      final offline = isOfflineError(reviews.error);
      reviewsState = _TabMessage(
        icon: offline ? AppIcons.wifiOffRounded : AppIcons.errorOutlineRounded,
        title: t.t(offline ? 'offline.title' : 'error.default.title'),
        message: t.t(offline ? 'offline.message' : 'reviews.error'),
        actionLabel: t.t('error.retry'),
        onAction: () => ref.invalidate(reviewsListProvider(_reviewsKey)),
      );
    } else if (state != null && state.items.isEmpty) {
      reviewsState = _stars != null
          ? _TabMessage(
              icon: AppIcons.starOutlineRounded,
              title: t.t('reviews.filter.emptyTitle', {'stars': '$_stars'}),
              message: t.t('reviews.filter.emptyMessage'),
              actionLabel: t.t('reviews.filter.showAll'),
              onAction: () => setState(() => _stars = null),
            )
          : _TabMessage(
              icon: AppIcons.starOutlineRounded,
              title: t.t('profile.rating.new'),
              message:
                  t.t(p.isSelf ? 'reviews.empty.self' : 'reviews.empty.other'),
            );
    } else if (state != null) {
      items = state.items;
      status = state.status;
    }
    final reviewsPage = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: AppSpacing.sm),
        if (!p.isSelf)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: Builder(
              builder: (context) {
                final mineAsync = ref.watch(myAttorneyReviewProvider(p.id));
                if (mineAsync.isLoading && !mineAsync.hasValue) {
                  return const SizedBox.shrink();
                }
                final error = mineAsync.error;
                if (error is ApiException &&
                    error.code == ApiErrorCodes.reviewCaseNotClosed) {
                  return const _ReviewOnlyAfterCaseHint();
                }
                final mine = mineAsync.value;
                return AppButton(
                  key: const ValueKey('review-write'),
                  label: t.t(
                    mine == null
                        ? 'reviews.write.action'
                        : 'reviews.write.edit',
                  ),
                  icon: mine == null
                      ? AppIcons.rateReviewOutlined
                      : AppIcons.editOutlined,
                  variant: mine == null
                      ? AppButtonVariant.primary
                      : AppButtonVariant.secondary,
                  height: AppSizes.touchTarget,
                  onPressed: () => _writeReview(t, mine),
                );
              },
            ),
          ),
        summary.when(
          skipLoadingOnReload: true,
          loading: () => const AppSkeleton(
            height: AppSizes.stateMedallion + AppSpacing.xxl,
            borderRadius: AppRadii.card,
          ),
          error: (_, __) => const SizedBox.shrink(),
          // No reviews: the tab's "New — no reviews" state says it all.
          data: (s) => s.isNew
              ? const SizedBox.shrink()
              : Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: ReviewSummaryPanel(
                    summary: s,
                    selectedStars: _stars,
                    sort: _sort,
                    // Tap a bar → only those reviews; tap again → all.
                    onStarsTap: (stars) => setState(
                      () => _stars = _stars == stars ? null : stars,
                    ),
                    onSort: (v) => setState(() => _sort = v),
                  ),
                ),
        ),
        // Owner 2026-10-20: inside the rating tab, under the rating block —
        // the attorney's own call to answer questions and their numbers.
        if (p.isSelf)
          QaProfileRow(answers: p.qaAnswers, best: p.qaBest, isSelf: p.isSelf),
        if (reviewsState != null) reviewsState,
        for (final review in items) ...[
          ReviewCard(
            review: review,
            // Owner 2026-10-01 (Google-style): anyone but the author flags;
            // the author edits / deletes; the attorney replies; others vote.
            onReport: review.isMine ? null : () => _report(t, review),
            onEdit: review.isMine ? () => _writeReview(t, review) : null,
            onDelete: review.isMine ? () => _deleteReview(t, review) : null,
            onReply: p.isSelf ? () => _reply(t, review) : null,
            onDeleteReply:
                p.isSelf ? () => _reply(t, review, remove: true) : null,
            onHelpful:
                review.isMine || p.isSelf ? null : () => _helpful(t, review),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        if (items.isNotEmpty)
          AppPaginationFooter(
            status: status,
            labels: AppPaginationLabels(
              loadingMore: t.t('pagination.loadingMore'),
              error: t.t('pagination.error'),
              retry: t.t('error.retry'),
              end: t.t('reviews.end'),
            ),
            onRetry: () =>
                ref.read(reviewsListProvider(_reviewsKey).notifier).loadMore(),
          ),
      ],
    );

    // Owner 2026-10-19: every page keeps at least half a screen (loading,
    // empty or short), so nothing pulls the page when its data arrives.
    Widget page(Widget child) => ConstrainedBox(
          constraints: BoxConstraints(
            minHeight: MediaQuery.sizeOf(context).height * 0.5,
          ),
          child: child,
        );

    return ProfileTabPages(
      initialPage: tabs.indexOf(_tab).clamp(0, tabs.length - 1),
      onPage: (i) => setState(() => _picked = tabs[i]),
      header: header,
      tabBar: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
        child: _Tabs(
          tabs: tabs,
          selected: _tab,
          onChanged: (tab) => setState(() => _picked = tab),
        ),
      ),
      // Owner 2026-10-12: the Briefs & reposts tab runs edge to edge.
      pagePadding: (i) => tabs[i] == AttorneyProfileTab.reposts
          ? const EdgeInsets.only(top: AppSpacing.sm, bottom: AppSpacing.xxl)
          : const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              2,
              AppSpacing.screenSide,
              AppSpacing.xxl,
            ),
      onNearEnd: (i) {
        if (tabs[i] == AttorneyProfileTab.reviews) {
          ref.read(reviewsListProvider(_reviewsKey).notifier).loadMore();
        }
      },
      onRefresh: () async {
        ref
          ..invalidate(reviewSummaryProvider(p.id))
          ..invalidate(reviewsListProvider(_reviewsKey));
        await widget.onRefresh();
      },
      pages: [
        for (final tab in tabs)
          page(
            tab == AttorneyProfileTab.reviews ? reviewsPage : _gridPage(t, tab),
          ),
      ],
    );
  }
}

/// Owner 2026-10-06: why there is no "Write a review" button — only
/// clients who completed a case with this attorney review them.
class _ReviewOnlyAfterCaseHint extends ConsumerWidget {
  const _ReviewOnlyAfterCaseHint();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Row(
      key: const ValueKey('review-only-after-case'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppIcon(AppIcons.infoOutlineRounded, color: colors.textSecondary),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            t.t('reviews.write.onlyAfterCase'),
            style: typography.bodySmall.copyWith(color: colors.textSecondary),
          ),
        ),
      ],
    );
  }
}

class _VerificationBanner extends StatelessWidget {
  const _VerificationBanner({required this.t});

  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: '${t.t('gate.verify.title')}. ${t.t('profile.verifyBanner.body')}',
      excludeSemantics: true,
      child: AppCard(
        onTap: () => context.push(AppRoutes.verification),
        child: Row(
          children: [
            const AppIconMedallion(icon: AppIcons.verifiedUserOutlined),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    t.t('gate.verify.title'),
                    style: typography.roleTitle.copyWith(color: colors.text),
                  ),
                  Text(
                    t.t('profile.verifyBanner.body'),
                    style: typography.bodySmall
                        .copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
            AppIcon(AppIcons.chevronRightRounded, color: colors.textSecondary),
          ],
        ),
      ),
    );
  }
}

class _HeaderCard extends ConsumerWidget {
  const _HeaderCard({required this.profile});

  final PublicAttorneyProfile profile;

  static const _avatar = AppSizes.profileAvatar;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final avatarRing = Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: profile.verifiedBadge
            ? LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [colors.goldLight, colors.gold, colors.goldDark],
              )
            : null,
        color: profile.verifiedBadge ? null : colors.border,
      ),
      child: DecoratedBox(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: colors.bg, width: 2),
        ),
        child: StoryAvatarRing(
          userId: profile.id,
          photoUrl: profile.avatarUrl,
          photoCloseLabel: t.t('common.close'),
          size: _avatar,
          child: ProfileAvatar(
            size: _avatar,
            url: profile.avatarUrl,
            initials: initialsOf(
              profile.firstName,
              profile.lastName,
              fallback: profile.username,
            ),
            heroTag: attorneyAvatarHeroTag(profile.username),
            semanticLabel: t.t('profile.avatar.label'),
            viewerCloseLabel: t.t('common.close'),
          ),
        ),
      ),
    );
    // Owner 2026-10-16: the trust-level badge sits on the avatar corner (as
    // in the feed), no longer as a pill beside the name.
    final avatar = TrustAvatarBadge(
      id: profile.id,
      size: _avatar + 6,
      trustLevel: profile.trustLevel,
      child: avatarRing,
    );
    // Owner 2026-09-30 (Instagram layout): avatar left with the counters
    // beside it; the name on its own line under the avatar, flush with
    // the left edge where the post grid starts.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            avatar,
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Row(
                children: [
                  _Counter(
                    value: SocialFormat.count(formats, profile.counters.posts),
                    label: t.t('profile.counters.posts'),
                  ),
                  _Counter(
                    value:
                        SocialFormat.count(formats, profile.counters.followers),
                    label: t.t('profile.counters.followers'),
                    onTap: () =>
                        context.push(SocialRoutes.followers(profile.id)),
                  ),
                  _Counter(
                    value:
                        SocialFormat.count(formats, profile.counters.following),
                    label: t.t('profile.counters.following'),
                    onTap: () =>
                        context.push(SocialRoutes.following(profile.id)),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Row(
          children: [
            Flexible(
              child: Semantics(
                header: true,
                child: Text(
                  profile.fullName.isEmpty
                      ? atHandle(profile.username)
                      : profile.fullName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: typography.body.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _Counter extends StatelessWidget {
  const _Counter({
    required this.value,
    required this.label,
    this.onTap,
    // ignore: unused_element_parameter
    this.star = false,
  });

  final String value;
  final String label;

  /// Followers / following open their lists (docs/05 §6.2); rating opens
  /// the Reviews tab.
  final VoidCallback? onTap;

  /// The rating counter: a gold star before the number.
  final bool star;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final tap = onTap;
    return Expanded(
      child: Semantics(
        label: '$value $label',
        button: tap != null,
        excludeSemantics: true,
        child: AppPressable(
          onTap: tap ?? () {},
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (star) ...[
                      AppIcon(
                        AppIcons.starRounded,
                        size: 16,
                        color: colors.gold,
                      ),
                      const SizedBox(width: 2),
                    ],
                    Flexible(
                      child: Text(
                        value,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: typography.body.copyWith(
                          color: colors.text,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style:
                      typography.caption.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AboutSection extends ConsumerWidget {
  const _AboutSection({required this.profile});

  final PublicAttorneyProfile profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final bio = profile.bio?.trim();
    // Owner 2026-09-29: the name moved next to the avatar (_HeaderCard)
    // and the "@username · Attorney" caption is gone — the handle is the
    // screen's centered title (ProfileHandleBar).
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Owner 2026-09-30: the "★ — · New" line is gone; ratings live on
        // the Reviews tab.
        if (bio != null && bio.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          // Owner 2026-10-05: «Перевести» (profiles zone).
          TranslatableText(
            kind: TranslatableKind.profile,
            id: profile.id,
            text: bio,
            enabled: !profile.isSelf,
            builder: (context, text) => Text(
              text,
              style: typography.bodySmall
                  .copyWith(color: colors.text, height: 1.4),
            ),
          ),
        ],
      ],
    );
  }
}

/// A practice chip: one specialization, or a category with several picked
/// specializations ("Family Law · 3", tap = full list) — docs/03 §3.2.
@immutable
class PracticeChipGroup {
  const PracticeChipGroup({required this.label, required this.items});
  final String label;
  final List<String> items;
}

List<PracticeChipGroup> groupPractices(
  Translator t,
  List<SelectedPractice> practices,
  Map<String, PracticeCategory> categories,
) {
  final byCategory = <String, List<SelectedPractice>>{};
  for (final p in practices) {
    (byCategory[p.categoryId] ??= []).add(p);
  }
  return [
    for (final entry in byCategory.entries)
      if (entry.value.length == 1)
        PracticeChipGroup(
          label: localizedName(
            t,
            entry.value.first.i18nKey,
            entry.value.first.nameEn,
          ),
          items: const [],
        )
      else
        PracticeChipGroup(
          label: localizedName(
            t,
            entry.value.first.categoryI18nKey,
            categories[entry.key]?.nameEn ??
                humanizeCode(entry.value.first.categoryCode),
          ),
          items: [
            for (final p in entry.value) localizedName(t, p.i18nKey, p.nameEn),
          ],
        ),
  ];
}

class _ChipRows extends ConsumerWidget {
  const _ChipRows({required this.profile});

  final PublicAttorneyProfile profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final tree = ref.watch(practiceTreeProvider).value ?? const [];
    final categories = {for (final c in tree) c.id: c};
    final groups = groupPractices(t, profile.practices, categories);
    final firms = profile.firms.isNotEmpty
        ? profile.firms
        : [if ((profile.firmName ?? '').trim().isNotEmpty) profile.firmName!];

    // One compact line per section (owner redesign): a small gold icon
    // (its label read by screen readers) + chips scrolling sideways.
    Widget row(String label, IconData icon, List<Widget> chips) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Row(
            children: [
              Semantics(
                label: label,
                child: AppIcon(
                  icon,
                  size: AppSizes.iconSm,
                  color: colors.goldDark,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (var i = 0; i < chips.length; i++) ...[
                        if (i > 0) const SizedBox(width: AppSpacing.xs),
                        chips[i],
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        );

    final languages = [
      for (final code in profile.languages)
        kLanguageCatalog
                .where((l) => l.code == code)
                .map((l) => l.nativeName)
                .firstOrNull ??
            code,
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (firms.isNotEmpty)
          row(
            t.t('profile.section.firm'),
            AppIcons.apartmentRounded,
            [for (final f in firms) AppChip(label: f)],
          ),
        if (groups.isNotEmpty)
          row(t.t('profile.section.practices'), AppIcons.gavelRounded, [
            for (final g in groups)
              AppChip(
                label: g.items.isEmpty
                    ? g.label
                    : t.t(
                        'profile.practices.group',
                        {'name': g.label, 'count': '${g.items.length}'},
                      ),
                trailing: g.items.isEmpty
                    ? null
                    : AppIcon(
                        AppIcons.expandMoreRounded,
                        size: AppSpacing.lg,
                        color: colors.textSecondary,
                      ),
                onTap: g.items.isEmpty ? null : () => _showGroup(context, g),
              ),
          ]),
        if (languages.isNotEmpty)
          row(t.t('profile.section.languages'), AppIcons.translateRounded, [
            for (final l in languages) AppChip(label: l),
          ]),
        if (profile.licensedStates.isNotEmpty)
          row(t.t('profile.section.states'), AppIcons.accountBalanceOutlined, [
            for (final s in profile.licensedStates) AppChip(label: s.name),
          ]),
      ],
    );
  }

  void _showGroup(BuildContext context, PracticeChipGroup group) {
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => PracticeGroupSheet(group: group),
    );
  }
}

/// Subcategories of one practice area (owner 2026-10-05): the sheet grows
/// up to most of the screen and the chips scroll, so 150 subcategories are
/// all reachable; from [searchFrom] items on, a search field narrows them.
class PracticeGroupSheet extends ConsumerStatefulWidget {
  const PracticeGroupSheet({required this.group, super.key});

  final PracticeChipGroup group;

  /// A group this long gets a search field above the chips.
  static const searchFrom = 12;

  @override
  ConsumerState<PracticeGroupSheet> createState() => _PracticeGroupSheetState();
}

class _PracticeGroupSheetState extends ConsumerState<PracticeGroupSheet> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final group = widget.group;
    final query = _search.text.trim().toLowerCase();
    final items = query.isEmpty
        ? group.items
        : [
            for (final i in group.items)
              if (i.toLowerCase().contains(query)) i,
          ];
    final media = MediaQuery.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: (media.size.height - media.viewInsets.bottom) * 0.9,
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              AppSpacing.md,
              AppSpacing.screenSide,
              AppSpacing.lg,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const AppSheetHandle(),
                Semantics(
                  header: true,
                  child: Text(
                    t.t(
                      'profile.practices.group',
                      {'name': group.label, 'count': '${group.items.length}'},
                    ),
                    style: typography.titleMedium.copyWith(color: colors.text),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                if (group.items.length >= PracticeGroupSheet.searchFrom) ...[
                  AppTextField(
                    key: const ValueKey('practice-group-search'),
                    controller: _search,
                    hintText: t.t('practices.search'),
                    semanticLabel: t.t('practices.search'),
                    leading: AppIcon(
                      AppIcons.searchRounded,
                      color: colors.textSecondary,
                      size: AppSizes.iconSm,
                    ),
                    textInputAction: TextInputAction.search,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppSpacing.md),
                ],
                Flexible(
                  child: items.isEmpty
                      ? Text(
                          t.t('search.empty.title'),
                          style: typography.body
                              .copyWith(color: colors.textSecondary),
                        )
                      : SingleChildScrollView(
                          child: Wrap(
                            spacing: AppSpacing.sm,
                            runSpacing: AppSpacing.sm,
                            children: [
                              for (final i in items) AppChip(label: i),
                            ],
                          ),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Quiet banner above the buttons while a block is in effect (OQ-028).
class _BlockNotice extends StatelessWidget {
  const _BlockNotice({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Row(
      children: [
        AppIcon(
          AppIcons.blockFlipped,
          size: AppSizes.iconSm,
          color: colors.danger,
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            text,
            style: typography.bodySmall.copyWith(color: colors.textSecondary),
          ),
        ),
      ],
    );
  }
}

class _Actions extends ConsumerWidget {
  const _Actions({
    required this.isSelf,
    required this.attorneyId,
    required this.isFollowing,
    required this.onMessage,
    required this.onShare,
    this.blocked = false,
    this.canMessage = true,
  });

  /// OQ-043: direct chats are attorney ↔ client.
  final bool canMessage;

  final bool isSelf;
  final String attorneyId;
  final bool isFollowing;
  final VoidCallback onMessage;
  final VoidCallback onShare;

  /// OQ-028: no Follow / Message while a block is in effect.
  final bool blocked;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    if (isSelf) {
      // Instagram: two equal buttons, "Edit profile" and "Share profile".
      return Row(
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
              onTap: onShare,
            ),
          ),
        ],
      );
    }
    return Row(
      children: [
        if (!blocked)
          Expanded(
            child: isSelf
                ? ProfileQuietButton(
                    label: t.t('profile.action.edit'),
                    onTap: () => context.push(AppRoutes.profileEdit),
                  )
                : FollowButton(
                    attorneyId: attorneyId,
                    initial: isFollowing,
                    expanded: true,
                  ),
          ),
        if (!isSelf && !blocked && canMessage) ...[
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: ProfileQuietButton(
              label: t.t('profile.action.message'),
              onTap: onMessage,
            ),
          ),
        ],
        if (blocked) const Spacer(),
        if (!blocked) const SizedBox(width: AppSpacing.sm),
        // Share as a small icon square (Instagram-style), full tap target.
        _IconSquare(
          icon: AppIcons.iosShareRounded,
          semanticLabel: t.t('profile.action.share'),
          onTap: onShare,
        ),
      ],
    );
  }
}

/// Small framed icon button of the action row (share, "⋯").
class _IconSquare extends StatelessWidget {
  const _IconSquare({
    required this.icon,
    required this.semanticLabel,
    required this.onTap,
  });

  final IconData icon;
  final String semanticLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      label: semanticLabel,
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          width: AppSizes.touchTarget,
          height: ProfileQuietButton.height,
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.field),
            border: Border.all(color: colors.border),
          ),
          child: AppIcon(icon, size: AppSizes.iconSm, color: colors.text),
        ),
      ),
    );
  }
}

class _Tabs extends ConsumerWidget {
  const _Tabs({
    required this.tabs,
    required this.selected,
    required this.onChanged,
  });

  final List<AttorneyProfileTab> tabs;
  final AttorneyProfileTab selected;
  final ValueChanged<AttorneyProfileTab> onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final reduce = context.reduceMotion;
    final items = [
      for (final tab in tabs)
        switch (tab) {
          AttorneyProfileTab.posts => (
              tab,
              t.t('profile.tab.posts'),
              AppIcons.gridOnRounded
            ),
          AttorneyProfileTab.reels => (
              tab,
              t.t('profile.tab.reels'),
              AppIcons.playCircleOutlined
            ),
          AttorneyProfileTab.threads => (
              tab,
              t.t('profile.tab.threads'),
              AppIcons.editNoteRounded
            ),
          AttorneyProfileTab.reposts => (
              tab,
              t.t('profile.tab.briefsReposts'),
              AppIcons.autoModeRounded
            ),
          AttorneyProfileTab.news => (
              tab,
              t.t('profile.tab.news'),
              AppIcons.newspaperRounded
            ),
          AttorneyProfileTab.reviews => (
              tab,
              t.t('profile.tab.reviews'),
              AppIcons.starBorderRounded
            ),
        },
    ];
    final index = tabs.indexOf(selected).clamp(0, tabs.length - 1);
    // Owner 2026-10-19 (Instagram): the tabs are pages — a tap glides to the
    // page, and the gold line follows the page as it is swiped.
    final pages = ProfileTabPages.controllerOf(context);
    void open(AttorneyProfileTab tab) {
      final i = tabs.indexOf(tab);
      if (pages != null && pages.hasClients && i >= 0) {
        unawaited(
          pages.animateToPage(
            i,
            duration:
                reduce ? Duration.zero : const Duration(milliseconds: 250),
            curve: Curves.easeOutCubic,
          ),
        );
      } else {
        onChanged(tab);
      }
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: colors.border)),
      ),
      child: Stack(
        children: [
          Row(
            children: [
              for (final (tab, label, icon) in items)
                Expanded(
                  child: Semantics(
                    button: true,
                    selected: tab == selected,
                    label: label,
                    excludeSemantics: true,
                    onTap: () => open(tab),
                    child: GestureDetector(
                      key: ValueKey('profile-tab-${tab.name}'),
                      behavior: HitTestBehavior.opaque,
                      onTap: () => open(tab),
                      child: SizedBox(
                        height: AppSizes.touchTarget,
                        child: AppIcon(
                          icon,
                          size: AppSizes.iconMd,
                          color: tab == selected
                              ? colors.text
                              : colors.textSecondary,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          Positioned.fill(
            child: pages == null
                ? AnimatedAlign(
                    // Directional: the tab Row flips in RTL, so must the bar.
                    alignment: AlignmentDirectional(
                      tabs.length < 2 ? -1 : -1 + 2 * index / (tabs.length - 1),
                      1,
                    ),
                    duration: reduce ? Duration.zero : AppMotion.stateChange,
                    curve: AppMotion.enterCurve,
                    child: FractionallySizedBox(
                      widthFactor: 1 / tabs.length,
                      child: Container(height: 2, color: colors.gold),
                    ),
                  )
                : AnimatedBuilder(
                    animation: pages,
                    builder: (context, child) {
                      final at = profileTabPosition(pages, index);
                      return Align(
                        alignment: AlignmentDirectional(
                          tabs.length < 2
                              ? -1
                              : -1 + 2 * at / (tabs.length - 1),
                          1,
                        ),
                        child: child,
                      );
                    },
                    child: FractionallySizedBox(
                      widthFactor: 1 / tabs.length,
                      child: Container(height: 2, color: colors.gold),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _TabMessage extends StatelessWidget {
  const _TabMessage({
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return AppEntrance(
      child: Padding(
        padding: const EdgeInsets.symmetric(
          vertical: AppSpacing.xl,
          horizontal: AppSpacing.lg,
        ),
        child: Column(
          children: [
            AppIconMedallion(
              icon: icon,
              size: AppSizes.stateMedallion - AppSpacing.xl,
              iconSize: AppSizes.iconLg,
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              title,
              textAlign: TextAlign.center,
              style: typography.roleTitle.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              message,
              textAlign: TextAlign.center,
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
            if (actionLabel != null) ...[
              const SizedBox(height: AppSpacing.lg),
              SizedBox(
                width: AppSizes.stateActionWidth,
                child: AppButton(
                  label: actionLabel!,
                  icon: AppIcons.refreshRounded,
                  variant: AppButtonVariant.secondary,
                  height: AppSizes.touchTarget,
                  onPressed: onAction,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Loading skeleton in the shape of the profile (header, rating card,
/// chips, tabs).
class AttorneyProfileSkeleton extends StatelessWidget {
  const AttorneyProfileSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.sm,
        AppSpacing.screenSide,
        AppSpacing.xxl,
      ),
      children: const [
        AppSkeleton(height: 200, borderRadius: AppRadii.card),
        SizedBox(height: AppSpacing.md),
        AppSkeleton(height: 104, borderRadius: AppRadii.card),
        SizedBox(height: AppSpacing.lg),
        FractionallySizedBox(
          widthFactor: 0.3,
          alignment: Alignment.centerLeft,
          child: AppSkeleton(
            height: AppSpacing.xl,
            borderRadius: AppRadii.pill,
          ),
        ),
        SizedBox(height: AppSpacing.md),
        AppSkeleton(height: AppSpacing.md),
        SizedBox(height: AppSpacing.sm),
        FractionallySizedBox(
          widthFactor: 0.8,
          alignment: Alignment.centerLeft,
          child: AppSkeleton(height: AppSpacing.md),
        ),
        SizedBox(height: AppSpacing.lg),
        Row(
          children: [
            AppSkeleton(width: 96, height: 36, borderRadius: AppRadii.pill),
            SizedBox(width: AppSpacing.sm),
            AppSkeleton(width: 120, height: 36, borderRadius: AppRadii.pill),
          ],
        ),
        SizedBox(height: AppSpacing.xl),
        AppSkeleton(
          height: AppSizes.touchTarget + AppSpacing.sm,
        ),
      ],
    );
  }
}

/// Message shown when a profile can't be opened: unknown, suspended
/// (docs/03 §4.2 «Профиль недоступен») or a client (§5: 404).
class ProfileUnavailableState extends ConsumerWidget {
  const ProfileUnavailableState({super.key, this.onBack});

  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return AppEmptyState(
      icon: AppIcons.personOffOutlined,
      title: t.t('profile.unavailable.title'),
      message: t.t('profile.unavailable.body'),
      action: onBack == null
          ? null
          : AppButton(
              label: t.t('common.back'),
              variant: AppButtonVariant.secondary,
              height: AppSizes.touchTarget,
              onPressed: onBack,
            ),
    );
  }
}
