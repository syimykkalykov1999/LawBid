import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/text/tidy_text.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:lawbid/features/feed/application/news_flag.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/presentation/promote_case_card.dart'
    show BoostButton;
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/reels/presentation/reels_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart'
    show PracticePostsScreen;
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';
import 'package:lawbid/features/social/presentation/widgets/comments_sheet.dart';
import 'package:lawbid/features/social/presentation/widgets/post_attachments_sheet.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/features/social/presentation/widgets/post_text_sheet.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/social/social_routes.dart';
import 'package:lawbid/features/team/application/team_providers.dart'
    show isAssistantProvider;
import 'package:lawbid/features/translation/data/content_translation_repository.dart';
import 'package:lawbid/features/translation/presentation/translatable_text.dart';

/// Owner 2026-09-30: a feed card fills the list viewport down to the nav
/// bar with no gaps between cards (edge-to-edge list); never
/// shorter than a readable minimum on tiny screens.
double feedCardHeight(double viewport) => math.max(440, viewport);

/// docs/05 §2.4 post card, top to bottom: author row (avatar, name,
/// @username + check, time, "⋯"), photos (carousel with a page indicator,
/// double tap = like with a heart burst), actions (like, comments, share,
/// save), likes, text collapsed after 3 lines with tappable #tags, "View
/// all comments (N)". Text-only posts render as a quote card. The card
/// always shows the latest local version of the post (likes/saves/edits
/// from any screen).
/// Room a feed video card keeps besides the video (dp): the icon row and
/// the two text lines (the author lies over the video). The video fills the
/// rest between the header and the nav bar (owner 2026-10-15).
const double _kVideoCardChrome = 128;

/// Owner 2026-10-15: a video in a list is at most 9:10 (our header already
/// takes room, unlike Instagram's 4:5).
const double _kVideoRatio = 0.9;

/// Owner 2026-10-15: two lines under a video's icons — the start of the
/// text (no author name), with «ещё» at the end of the second line.
class _VideoOneLine extends ConsumerWidget {
  const _VideoOneLine({
    required this.post,
    required this.line,
    required this.onMore,
  });

  final Post post;
  final String line;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final oneLine = line.replaceAll(RegExp(r'\s+'), ' ').trim();
    final more = t.t('post.more');
    // Measured with the same style the Text draws (DefaultTextStyle merged),
    // or «ещё» can fall to a third line and be clipped (owner 2026-10-15).
    final base = DefaultTextStyle.of(context)
        .style
        .merge(type.body.copyWith(color: colors.text));
    return Semantics(
      button: true,
      label: more,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onMore,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            0,
            AppSpacing.lg,
            AppSpacing.xs,
          ),
          child: LayoutBuilder(
            builder: (context, box) {
              final textScaler = MediaQuery.textScalerOf(context);
              TextPainter painter(String s) => TextPainter(
                    text: TextSpan(text: s, style: base),
                    textDirection: Directionality.of(context),
                    textScaler: textScaler,
                    maxLines: 2,
                  )..layout(maxWidth: box.maxWidth);
              // Whole text fits two lines: nothing to cut, «ещё» still ends
              // the second line.
              var shown = oneLine;
              if (painter('$shown  $more').didExceedMaxLines) {
                var lo = 0;
                var hi = oneLine.length;
                while (lo < hi) {
                  final mid = (lo + hi + 1) ~/ 2;
                  final cut = oneLine.substring(0, mid).trimRight();
                  if (painter('$cut…  $more').didExceedMaxLines) {
                    hi = mid - 1;
                  } else {
                    lo = mid;
                  }
                }
                shown = '${oneLine.substring(0, lo).trimRight()}…';
              }
              return Text.rich(
                TextSpan(
                  children: [
                    TextSpan(text: shown),
                    TextSpan(
                      text: '  $more',
                      style: TextStyle(color: colors.textSecondary),
                    ),
                  ],
                ),
                maxLines: 2,
                style: base,
              );
            },
          ),
        ),
      ),
    );
  }
}

class PostCard extends ConsumerWidget {
  const PostCard({
    required this.post,
    this.inDetail = false,
    this.feedHeight,
    this.fromProfile = false,
    this.onReply,
    this.showPin = false,
    super.key,
  });

  final Post post;

  /// The open thread of a text post: the reply icon focuses the field.
  final VoidCallback? onReply;

  /// Owner 2026-10-12: the profile's list shows a pinned post's "Pinned".
  final bool showPin;

  /// Owner 2026-10-12: a text-only post without a qualification is a
  /// Threads thread (replies right under it when opened).
  static bool isThreadsStyle(Post p) =>
      !p.isNews && p.video == null && p.media.isEmpty && p.attachments.isEmpty;

  /// Owner 2026-10-07: a post opened from someone's grid (their own feed
  /// of posts, or the post screen reached from it): no author row — the
  /// viewer already knows whose content it is — and a tap on the photo
  /// opens the post instead of the gallery.
  final bool fromProfile;

  /// Owner 2026-10-06: posts without a qualification (practice) and not
  /// News render like Instagram posts: photo first, actions, likes,
  /// caption under the photo, comments link, time.
  static bool isInstagramStyle(Post p) => p.practice == null && !p.isNews;

  /// Owner 2026-09-30: in the feed one card fills the visible area down to
  /// the nav bar; the photo takes all the space the text leaves, edge to
  /// edge. Null = natural height (2:1 photo band).
  final double? feedHeight;

  /// On the post screen: full text, no "view comments" link.
  final bool inDetail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p =
        ref.watch(postOverridesProvider.select((m) => m[post.id])) ?? post;
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final actions = ref.read(socialActionsProvider);

    Future<void> run(Future<Object?> Function() action) async {
      final error = await action();
      if (error != null && context.mounted) {
        showAppSnackBar(context, errorText(t, error));
      }
    }

    // Owner 2026-10-06: a post published without a qualification (and
    // not News) is an everyday post and looks exactly like an Instagram
    // post; a post with a qualification keeps the LawBid card.
    final insta = isInstagramStyle(p);
    // Owner 2026-09-30: feed cards run edge to edge (Instagram style):
    // no side border or rounded corners, hairlines on top and bottom.
    // Owner 2026-10-07: the open post and a profile's feed of posts are
    // full width too (Instagram), no card around them.
    // Owner 2026-10-12: a text post is edge to edge in every list (Threads).
    final edge = (feedHeight != null && !inDetail) ||
        inDetail ||
        fromProfile ||
        isThreadsStyle(p);
    // Owner 2026-10-12: the practice card in a list has no side borders or
    // shadow, only a thin divider (a strip of the page background) below.
    final flat = !inDetail && !isThreadsStyle(p);
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius:
            edge || flat ? null : BorderRadius.circular(AppRadii.card),
        border: flat
            // Owner 2026-10-13: no empty strip between posts, only a hairline.
            ? Border(bottom: BorderSide(color: colors.border))
            : edge
                ? Border.symmetric(horizontal: BorderSide(color: colors.border))
                : Border.all(color: colors.border),
        boxShadow: flat
            ? null
            : [
                BoxShadow(
                  color: colors.shadow,
                  blurRadius: AppSizes.cardShadowBlur,
                  offset: const Offset(0, AppSizes.cardShadowOffsetY),
                ),
              ],
      ),
      clipBehavior: Clip.antiAlias,
      // Owner 2026-09-30: double tap anywhere on the post likes it, with
      // the heart (Instagram).
      child: DoubleTapLike(
        onLike: () => run(() => actions.like(p)),
        child: isThreadsStyle(p)
            // Owner 2026-10-07: a post without photos or video looks like
            // a Threads post.
            ? _ThreadsPost(
                post: p,
                inDetail: inDetail,
                run: run,
                promotionId: post.promotionId,
                fromProfile: fromProfile,
                onReply: onReply,
                showPin: showPin,
                // Owner 2026-10-15: a card is as tall as its content (like
                // Instagram), never a fixed height.
              )
            // Owner 2026-10-12: one card for every post with a photo or a
            // reel in a list — with a practice or without (no chips then).
            : insta && inDetail
                ? _InstagramPost(
                    post: p,
                    inDetail: inDetail,
                    run: run,
                    promotionId: post.promotionId,
                    fromProfile: fromProfile,
                  )
                : inDetail
                    ? _detail(context, ref, p, t, colors, actions, run)
                    : _feed(
                        context,
                        p,
                        t,
                        colors,
                        run,
                        innerOn: ref.watch(innerCardsEnabledProvider),
                      ),
      ),
    );
  }

  /// Owner 2026-10-12 design (feed, variant A2): edge to edge like
  /// Instagram — author, square photo(s), actions with the date by Save,
  /// up to two practice chips, title, two lines of text with "more", the
  /// hashtags, document chips.
  Widget _feed(
    BuildContext context,
    Post p,
    Translator t,
    AppColorTokens colors,
    Future<void> Function(Future<Object?> Function()) run, {
    double? fillHeight,
    bool innerOn = true,
  }) {
    final (title, rest) = titleAndRest(p);
    final (text, hashtags) = splitTrailingTags(rest);
    // Owner 2026-10-05: a promoted post reports the open for the owner's
    // stats (reach / clicks), like Instagram.
    final promotionId = post.promotionId;
    // Owner 2026-10-13: a post without attachments has no inner card — a
    // tap on it opens nothing (like Instagram); comments via the sheet.
    final hasInner = p.hasInner && innerOn;
    void open() {
      if (!hasInner) return;
      if (promotionId != null) {
        ProviderScope.containerOf(context)
            .read(promotionsRepositoryProvider)
            .click(promotionId);
      }
      context.push(SocialRoutes.post(p.id, fromProfile: fromProfile));
    }

    void like() => run(
          () => ProviderScope.containerOf(context)
              .read(socialActionsProvider)
              .like(p),
        );
    // Owner 2026-09-30: the author's photos (up to 9) or, when there are
    // none, the default art of the post's practice — full card width.
    // Owner 2026-10-01: a reel plays muted in the card; a tap opens the
    // full-screen reels starting with it.
    // Owner 2026-10-12: a card is one screen — from the status bar to the
    // nav bar; the photo takes what the other blocks leave (the fullest
    // post has a smaller photo, a photo-only post a full-screen one).
    final width = MediaQuery.sizeOf(context).width;
    // Owner 2026-10-13: one card is exactly the screen between the header
    // and the navbar; the photo takes what the text, chips and files
    // leave, and only a tiny leftover (under 30% of the screen) lets the
    // card grow instead.
    final minPhoto = MediaQuery.sizeOf(context).height * 0.3;
    // Owner 2026-10-15 (like Instagram): the frame follows the first photo's
    // shape, at most 4:5 tall and 1.91:1 wide (PostMedia.aspectRatio is
    // bounded); anything longer is cropped to the centre, whole when opened.
    final frameRatio = p.video == null && p.media.isNotEmpty
        ? p.media.first.listAspectRatio
        : 0.8;
    // Owner 2026-10-15: a video fills the screen between the header and the
    // nav bar (author row + video + actions), cropped to the centre.
    final cardRest = feedHeight == null
        ? double.infinity
        : math.max(minPhoto, feedHeight! - _kVideoCardChrome);
    final photoBase = fillHeight != null || feedHeight != null
        ? math.max(width / frameRatio, minPhoto)
        : width / frameRatio;
    final photoHeight = p.video != null && feedHeight != null
        ? cardRest
        : (p.video != null ? math.min(photoBase, cardRest) : photoBase);
    Widget photoBox(Widget child, {required bool fill, VoidCallback? onShort}) {
      if (!fill) return SizedBox(height: photoHeight, child: child);
      return Expanded(
        child: LayoutBuilder(
          builder: (context, box) {
            if (onShort != null && box.maxHeight < minPhoto - 1) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (context.mounted) onShort();
              });
            }
            return child;
          },
        ),
      );
    }

    Widget photoFor({required bool fill, VoidCallback? onShort}) {
      if (p.video == null && p.media.length > 1) {
        final carousel = _FeedCarousel(
          media: p.media,
          semanticLabel: t.t('post.media.label'),
          onDoubleTap: like,
          onTap: open,
          fill: true,
        );
        return fill
            ? photoBox(carousel, fill: true, onShort: onShort)
            : SizedBox(height: photoHeight, child: carousel);
      }
      final picture = p.video != null
          ? Stack(
              fit: StackFit.expand,
              children: [
                InlineReel(
                  post: p,
                  onOpen: () => ReelsScreen.open(context, from: p),
                  topInset: fromProfile ? 0 : 52,
                ),
                if (!fromProfile)
                  Positioned(
                    top: 0,
                    left: 0,
                    right: 0,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.5),
                            Colors.black.withValues(alpha: 0),
                          ],
                        ),
                      ),
                      child: _AuthorRow(
                        post: p,
                        sponsored: post.promotionId != null,
                        compact: true,
                        onDark: true,
                      ),
                    ),
                  ),
              ],
            )
          : p.media.isNotEmpty
              ? PostMediaCarousel(
                  media: p.media,
                  semanticLabel: t.t('post.media.label'),
                  fill: true,
                  onDoubleTap: like,
                )
              : PracticePhoto(
                  categoryCode: p.practice?.categoryCode ??
                      p.tags
                          .map(topicCategory)
                          .firstWhere((c) => c != null, orElse: () => null),
                  practiceCode: p.practice?.code,
                  seed: p.id,
                );
      // Owner 2026-10-13: the inner card opens only by «ещё» and the
      // attached files, never by a tap on the picture.
      return photoBox(picture, fill: fill, onShort: onShort);
    }

    // Owner 2026-10-12: the height the compact header frees goes to the
    // card — it fills the list's viewport, the photo takes what the text
    // leaves (square when the card is natural height).
    // Owner 2026-10-15: a video card is exactly the room between the header
    // and the nav bar — the video takes what the icons and the two text lines
    // leave (a fixed guess for them let «ещё» slip under the nav bar).
    return _FeedFill(
      height: fillHeight ?? (p.video != null ? feedHeight : null),
      builder: ({required fill, required onExpand}) => Column(
        mainAxisSize: fill ? MainAxisSize.max : MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Owner 2026-10-12: on a reel the author row lies over the video.
          if (!fromProfile && p.video == null)
            _AuthorRow(
              post: p,
              sponsored: post.promotionId != null,
              compact: true,
            )
          else if (fromProfile && p.isMine)
            _OwnMenuRow(post: p),
          photoFor(fill: fill, onShort: onExpand),
          PostActionsBar(post: p, run: run, showTime: true),
          // Owner 2026-10-15: a video post — author, video, icons, then ONE
          // line (nick + the start of the text) with «ещё» at its end; the
          // text, the topic chips and the tags open in a sheet from below.
          if (p.video != null)
            _VideoOneLine(
              post: p,
              line: title.isNotEmpty ? '$title $text' : text,
              onMore: () => showPostTextSheet(context, p),
            )
          else
            PostPracticeChips(post: p),
          if (p.video == null &&
              (title.isNotEmpty || text.isNotEmpty || hashtags.isNotEmpty))
            _FeedCaption(
              // A new text (translation) starts collapsed again.
              key: ValueKey('${p.id}:${title.hashCode}:${text.hashCode}'),
              title: title,
              text: text,
              hashtags: hashtags,
              onOpen: open,
              onExpand: onExpand,
              // Owner 2026-10-13: «ещё» always opens the text sheet; the
              // inner card opens from the attached files.
              inPlaceOnly: true,
              onMore: () => showPostTextSheet(context, p),
            ),
          if (p.video == null && p.attachments.isNotEmpty)
            _DocChips(documents: p.attachments, onOpen: open),
          const SizedBox(height: AppSpacing.md),
        ],
      ),
    );
  }

  static final _trailingTags = RegExp(
    r'(?:^|\s+)(?:#[\p{L}\p{N}_]+\s*)+$',
    unicode: true,
  );

  /// The hashtags that close a text are shown apart, in grey, at the very
  /// bottom of the description (owner 2026-10-12).
  static (String, List<String>) splitTrailingTags(String text) {
    final trimmed = text.trim();
    final m = _trailingTags.firstMatch(trimmed);
    if (m == null) return (trimmed, const []);
    final tags = [
      for (final x
          in RegExp(r'#[\p{L}\p{N}_]+', unicode: true).allMatches(m.group(0)!))
        x.group(0)!,
    ];
    return (trimmed.substring(0, m.start).trim(), tags);
  }

  /// Owner 2026-09-30: the post's own title and its whole text; older
  /// posts split their text.
  static (String, String) titleAndRest(Post p) => _titleAndBody(p, p.body);

  /// [titleAndRest] with [body] in place of the post's (a translation).
  static (String, String) _titleAndBody(Post p, String body) {
    final title = p.title;
    if (title != null && title.trim().isNotEmpty) {
      return (title.trim(), body.trim());
    }
    return _split(body);
  }

  /// "Title" = the first line (or sentence) of the post, the rest below.
  static (String, String) _split(String body) {
    final text = tidyText(body);
    final nl = text.indexOf('\n');
    if (nl > 0 && nl <= 120) {
      return (text.substring(0, nl).trim(), text.substring(nl + 1).trim());
    }
    final dot = text.indexOf(RegExp(r'[.!?](\s|$)'));
    if (dot > 0 && dot <= 100) {
      return (
        text.substring(0, dot + 1).trim(),
        text.substring(dot + 1).trim(),
      );
    }
    return (text, '');
  }

  /// Owner 2026-09-30 design, open post: author, topics, title, full text,
  /// photos, then the actions.
  Widget _detail(
    BuildContext context,
    WidgetRef ref,
    Post p,
    Translator t,
    AppColorTokens colors,
    SocialActions actions,
    Future<void> Function(Future<Object?> Function()) run,
  ) {
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!fromProfile)
          _AuthorRow(post: p, sponsored: post.promotionId != null)
        else if (p.isMine)
          _OwnMenuRow(post: p)
        else
          const SizedBox(height: AppSpacing.md),
        if (p.tags.isNotEmpty || p.practice != null || p.isNews)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              0,
              AppSpacing.lg,
              AppSpacing.md,
            ),
            child: _TopicChips(
              tags: p.tags,
              practice: p.practice,
              news: p.isNews,
            ),
          ),
        _TimeLine(post: p),
        // Owner 2026-10-05: «Перевести» under the text (posts zone); the
        // translation replaces the body on screen, the title stays.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          child: TranslatableText(
            kind: TranslatableKind.post,
            id: p.id,
            text: p.body,
            enabled: !p.isMine,
            builder: (context, body) {
              final (title, rest) = _titleAndBody(p, body);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // OQ-042: @mentions / #tags tappable in the title line too.
                  PostBodyText(
                    body: title,
                    expanded: true,
                    mentions: p.mentions,
                    style: typography.titleLarge.copyWith(
                      fontFamily: typography.body.fontFamily,
                      color: colors.text,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (rest.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.sm),
                      child: PostBodyText(
                        body: rest,
                        expanded: true,
                        mentions: p.mentions,
                      ),
                    ),
                ],
              );
            },
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        if (p.video != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppRadii.card - 2),
              child: AspectRatio(
                aspectRatio: _kVideoRatio,
                child: InlineReel(
                  post: p,
                  onOpen: () => ReelsScreen.open(context, from: p),
                ),
              ),
            ),
          ),
        if (p.media.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppRadii.card - 2),
              child: PostMediaCarousel(
                media: p.media,
                semanticLabel: t.t('post.media.label'),
                onDoubleTap: () => run(() => actions.like(p)),
                // All (up to 9) photos full screen: swipe and zoom.
                onTap: (i) => showPhotoGallery(
                  context,
                  urls: [for (final m in p.media) m.url],
                  initial: i,
                  closeLabel: t.t('common.close'),
                ),
              ),
            ),
          ),
        // Owner 2026-10-07 (bug 13): «Посмотреть · N» opens the files.
        if (p.attachments.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.lg,
              0,
            ),
            child: PostAttachmentsButton(
              media: p.media,
              documents: p.attachments,
            ),
          ),
        // Owner 2026-10-07: the comment button opens the comments sheet.
        PostActionsBar(post: p, run: run, boost: false, reactions: false),
        if (p.likeCount > 0 && showLikeCount(ref, p))
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              0,
              AppSpacing.lg,
              AppSpacing.xs,
            ),
            child: Text(
              SocialFormat.plural(
                t,
                ref.watch(l10nFormatsProvider),
                'post.likes',
                p.likeCount,
              ),
              style: Theme.of(context)
                  .extension<AppTypographyTokens>()!
                  .bodySmall
                  .copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ),
        if (p.pendingReview)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.xs,
              AppSpacing.lg,
              0,
            ),
            child: Row(
              children: [
                AppIcon(
                  AppIcons.hourglassTopRounded,
                  size: 14,
                  color: colors.textSecondary,
                ),
                const SizedBox(width: AppSpacing.xs),
                Flexible(
                  child: Text(
                    t.t('post.pending_review'),
                    style: Theme.of(context)
                        .extension<AppTypographyTokens>()!
                        .caption
                        .copyWith(color: colors.textSecondary),
                  ),
                ),
              ],
            ),
          ),
        if (p.editedAt != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: Text(
              t.t('post.edited'),
              style: Theme.of(context)
                  .extension<AppTypographyTokens>()!
                  .caption
                  .copyWith(color: colors.textSecondary),
            ),
          ),
        if (p.commentCount > 0)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(
              onPressed: () => showCommentsSheet(
                context,
                postId: p.id,
                commentsEnabled: p.commentsEnabled,
              ),
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                foregroundColor: colors.textSecondary,
              ),
              child: Text(
                t.t('post.viewComments', {
                  'count': SocialFormat.count(
                    ref.watch(l10nFormatsProvider),
                    p.commentCount,
                  ),
                }),
              ),
            ),
          ),
        const SizedBox(height: AppSpacing.md),
      ],
    );
  }
}

/// Owner 2026-10-06: a post without a qualification looks exactly like an
/// Instagram post, top to bottom: author row, the photos (or the reel)
/// full width at their own ratio (4:5 … 1.91:1), the actions (like,
/// comment, share … save), "N likes", the author's name in bold followed
/// by the caption (#tags and @mentions tappable, "more" after two lines),
/// "View all comments (N)" and the time. Text-only posts keep the same
/// order with the text in place of the photo. On the post screen the
/// caption is whole, translatable, and the documents follow the photos.
class _InstagramPost extends ConsumerWidget {
  const _InstagramPost({
    required this.post,
    required this.inDetail,
    required this.run,
    this.promotionId,
    this.fromProfile = false,
  });

  final Post post;
  final bool inDetail;
  final bool fromProfile;

  /// A paid promoted post: «Реклама» under the name, opens are reported.
  final String? promotionId;
  final Future<void> Function(Future<Object?> Function()) run;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = post;
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final actions = ref.read(socialActionsProvider);
    void open() {
      final id = promotionId;
      if (id != null) {
        ref.read(promotionsRepositoryProvider).click(id);
      }
      context.push(SocialRoutes.post(p.id, fromProfile: fromProfile));
    }

    final hasMedia = p.video != null || p.media.isNotEmpty;
    final caption = [
      if (p.title != null && p.title!.trim().isNotEmpty) p.title!.trim(),
      p.body.trim(),
    ].where((s) => s.isNotEmpty).join('\n');
    const side = EdgeInsets.symmetric(horizontal: AppSpacing.lg);

    Widget captionText(String text) => PostBodyText(
          // A new text (translation) starts collapsed again.
          key: ValueKey(text.hashCode),
          body: text,
          leading: hasMedia ? p.author.username : null,
          onLeadingTap: () => openAuthorProfile(context, ref, p.author),
          expanded: inDetail,
          // Owner 2026-10-07: two lines in the feed, the rest inside.
          collapsedLines: 2,
          onMore: inDetail ? null : open,
          mentions: p.mentions,
          large: !hasMedia,
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!fromProfile)
          _AuthorRow(post: p, sponsored: promotionId != null)
        else if (p.isMine)
          _OwnMenuRow(post: p),
        if (p.video != null)
          AspectRatio(
            aspectRatio: p.video!.aspectRatio.clamp(_kVideoRatio, 1.91),
            child: InlineReel(
              post: p,
              onOpen: () => ReelsScreen.open(context, from: p),
            ),
          )
        else if (p.media.isNotEmpty)
          // Full width at the first photo's own ratio; tap = full screen
          // gallery (swipe, zoom), double tap = like.
          PostMediaCarousel(
            media: p.media,
            inList: !inDetail,
            semanticLabel: t.t('post.media.label'),
            onDoubleTap: () => run(() => actions.like(p)),
            // Owner 2026-10-07: in someone's feed of posts a tap opens
            // the post; inside it, the full-screen gallery.
            onTap: fromProfile && !inDetail
                ? (_) => open()
                : (i) => showPhotoGallery(
                      context,
                      urls: [for (final m in p.media) m.url],
                      initial: i,
                      closeLabel: t.t('common.close'),
                    ),
          )
        else if (caption.isNotEmpty)
          // Text only: the text takes the photo's place.
          Padding(
            padding: side,
            child: inDetail
                ? TranslatableText(
                    kind: TranslatableKind.post,
                    id: p.id,
                    text: caption,
                    enabled: !p.isMine,
                    builder: (context, text) => captionText(text),
                  )
                : captionText(caption),
          ),
        PostActionsBar(
          post: p,
          run: run,
          showCounts: false,
          boost: !inDetail,
          reactions: !inDetail,
          // Inside the post the comment field is right below.
          // Owner 2026-10-07: the comment button opens the comments sheet,
          // inside the post too.
        ),
        if (p.likeCount > 0 && showLikeCount(ref, p))
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              0,
              AppSpacing.lg,
              AppSpacing.xs,
            ),
            child: Text(
              SocialFormat.plural(t, f, 'post.likes', p.likeCount),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.bodySmall.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        if (hasMedia && caption.isNotEmpty)
          Padding(
            padding: side,
            child: inDetail
                ? TranslatableText(
                    kind: TranslatableKind.post,
                    id: p.id,
                    text: caption,
                    enabled: !p.isMine,
                    builder: (context, text) => captionText(text),
                  )
                : captionText(caption),
          ),
        // Owner 2026-10-07 (bug 13): one small «Посмотреть · N» button;
        // the photos and files open in a sheet.
        if (p.attachments.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.sm,
              AppSpacing.lg,
              0,
            ),
            child: PostAttachmentsButton(
              media: p.media,
              documents: p.attachments,
            ),
          ),
        if (p.commentCount > 0)
          AppPressable(
            onTap: () => showCommentsSheet(
              context,
              postId: p.id,
              commentsEnabled: p.commentsEnabled,
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.xs,
                AppSpacing.lg,
                0,
              ),
              child: Text(
                t.t('post.viewComments', {
                  'count': SocialFormat.count(f, p.commentCount),
                }),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.bodySmall.copyWith(color: colors.textSecondary),
              ),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.xs,
            AppSpacing.lg,
            0,
          ),
          child: Text(
            SocialFormat.ago(t, f, p.createdAt),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
        ),
        if (inDetail && p.editedAt != null)
          Padding(
            padding: side,
            child: Text(
              t.t('post.edited'),
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
          ),
        if (inDetail && p.pendingReview)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.xs,
              AppSpacing.lg,
              0,
            ),
            child: Text(
              t.t('post.pending_review'),
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
          ),
        const SizedBox(height: AppSpacing.md),
      ],
    );
  }
}

/// Owner 2026-10-07: a post without photos or video, exactly like Threads:
/// the avatar on the left, the name and time, the text, then the actions
/// with their counts.
class _ThreadsPost extends ConsumerWidget {
  const _ThreadsPost({
    required this.post,
    required this.inDetail,
    required this.run,
    this.promotionId,
    this.fromProfile = false,
    this.onReply,
    this.showPin = false,
  });

  final Post post;
  final bool inDetail;
  final bool fromProfile;
  final String? promotionId;
  final Future<void> Function(Future<Object?> Function()) run;

  /// Open thread: the reply icon focuses the reply field below.
  final VoidCallback? onReply;

  /// Owner 2026-10-12: the profile's list shows a pinned post's "Pinned".
  final bool showPin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = post;
    final a = p.author;
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final actions = ref.read(socialActionsProvider);
    void open() {
      final id = promotionId;
      if (id != null) ref.read(promotionsRepositoryProvider).click(id);
      context.push(SocialRoutes.post(p.id, fromProfile: fromProfile));
    }

    final title = (p.title ?? '').trim();
    final body = p.body.trim();
    final text = [title, body].where((s) => s.isNotEmpty).join('\n');
    // Owner 2026-10-13: in the feed a brief is exactly half a screen (two
    // fit between the header and the navbar); the text folds to the lines
    // that fit, «ещё» opens the rest.
    Widget bodyText(String s) => PostBodyText(
          key: ValueKey(s.hashCode),
          body: s,
          expanded: inDetail,
          // Owner 2026-10-12 (Threads): up to 500 characters in full; a
          // longer text folds to five lines.
          // Owner 2026-10-15: the card follows its text; a long one folds
          // to six lines with «ещё».
          collapsedLines: inDetail ? 1000 : 6,
          onMore: inDetail ? null : open,
          mentions: p.mentions,
          large: inDetail,
        );

    Widget action(Widget icon, int count) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            icon,
            if (count > 0)
              Padding(
                padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
                child: Text(
                  SocialFormat.count(f, count),
                  style: type.bodySmall.copyWith(
                    color: colors.textSecondary,
                    fontSize: 13,
                  ),
                ),
              ),
          ],
        );

    final repostedBy = p.repostedBy;
    final menuButton = AppIconButton(
      icon: AppIcon(
        AppIcons.moreHorizRounded,
        size: 20,
        color: colors.textSecondary,
      ),
      semanticLabel: t.t('post.menu'),
      onPressed: () => showPostMenu(context, ref, p),
    );
    Widget nameRow({bool compact = false}) => Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: GestureDetector(
                          onTap: () => openAuthorProfile(context, ref, a),
                          child: Text(
                            // Owner 2026-10-15: like every other post — the
                            // name on top, the role line below.
                            a.displayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.bodySmall.copyWith(
                              color: colors.text,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                      if (a.verified) ...[
                        const SizedBox(width: AppSpacing.xs),
                        VerifiedCheck(
                          label: t.t('post.verified'),
                          size: 14,
                          gold: a.isClient,
                        ),
                      ],
                    ],
                  ),
                  Text(
                    promotionId != null
                        ? t.t('promote.sponsored')
                        : a.isClient
                            ? '@${a.username} · ${t.t('person.client')}'
                            : a.verified
                                ? t.t('post.licensedAttorney')
                                : '@${a.username}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
            // Owner 2026-10-14: on my own post Boost sits here, right of the
            // username (where Follow sits on someone else's).
            if (p.isMine && !ref.watch(isAssistantProvider)) ...[
              BoostButton(postId: p.id),
              const SizedBox(width: AppSpacing.xs),
            ],
            // With a "reposted" line under the name the row is only as tall
            // as the name, so that line sits right under it.
            if (compact)
              SizedBox(
                width: 48,
                height: 28,
                child: OverflowBox(
                  maxHeight: 48,
                  child: menuButton,
                ),
              )
            else
              menuButton,
          ],
        );

    // Owner 2026-10-13: "name reposted" in small grey under the author's
    // name, before the text; no icon.
    Widget repostLine() {
      final who = repostedBy!;
      return Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.xs),
        child: Align(
          alignment: AlignmentDirectional.centerStart,
          child: GestureDetector(
            onTap: () => openProfile(
              context,
              ref,
              id: who.id,
              username: who.username,
              isClient: who.isClient,
            ),
            child: Text(
              t.t('post.repostedBy', {'username': who.username}),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
          ),
        ),
      );
    }

    Widget pinLine() => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.xs),
          child: Row(
            children: [
              SizedBox(
                width: 36,
                child: Align(
                  alignment: AlignmentDirectional.centerEnd,
                  child: AppIcon(
                    AppIcons.pushPin,
                    size: 14,
                    color: colors.textSecondary,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Text(
                t.t('post.pinned'),
                style: type.caption.copyWith(
                  color: colors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        );

    final avatar = GestureDetector(
      onTap: () => openAuthorProfile(context, ref, a),
      child: IdentityAvatar(
        id: a.id,
        url: a.avatarUrl,
        initials: a.initials,
        size: 36,
        ring: a.verified,
        trustLevel: a.isClient ? 0 : a.trustLevel,
        rejected: !a.isClient && a.identityRejected,
      ),
    );

    final textBlock = text.isNotEmpty && inDetail
        ? TranslatableText(
            kind: TranslatableKind.post,
            id: p.id,
            text: text,
            enabled: !p.isMine,
            builder: (context, s) => bodyText(s),
          )
        : (text.isNotEmpty ? bodyText(text) : const SizedBox.shrink());

    // Owner 2026-10-12 (Threads): like, reply, repost, share with counts.
    final actionRow = Row(
      children: [
        Expanded(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: AlignmentDirectional.centerStart,
            // The first icon's edge on the avatar's edge (the icon sits 7 in
            // its 34-wide touch area).
            child: Transform.translate(
              offset: const Offset(-7, 0),
              child: Row(
                children: [
                  action(
                    BounceIcon(
                      active: p.likedByMe,
                      activeIcon: AppIcons.favoriteRounded,
                      icon: AppIcons.favoriteBorderRounded,
                      activeColor: colors.danger,
                      size: 22,
                      extent: 34,
                      label: t.t(p.likedByMe ? 'post.unlike' : 'post.like'),
                      onTap: () => run(() => actions.toggleLike(p)),
                    ),
                    0,
                  ),
                  action(
                    BounceIcon(
                      active: false,
                      activeIcon: AppIcons.modeCommentOutlined,
                      icon: AppIcons.modeCommentOutlined,
                      size: 22,
                      extent: 34,
                      label: t.t('post.comments'),
                      // In the open thread the replies are right below:
                      // no sheet.
                      onTap: () => inDetail
                          ? onReply?.call()
                          : context.push(SocialRoutes.post(p.id)),
                    ),
                    p.commentCount,
                  ),
                  action(
                    BounceIcon(
                      active: p.repostedByMe,
                      activeIcon: AppIcons.autoModeRounded,
                      icon: AppIcons.autoModeRounded,
                      activeColor: colors.success,
                      size: 22,
                      extent: 34,
                      label:
                          t.t(p.repostedByMe ? 'post.unrepost' : 'post.repost'),
                      onTap: () => run(() => actions.toggleRepost(p)),
                    ),
                    p.repostCount,
                  ),
                  action(
                    BounceIcon(
                      active: false,
                      activeIcon: AppIcons.sendOutlined,
                      icon: AppIcons.sendOutlined,
                      size: 22,
                      extent: 34,
                      label: t.t('post.share'),
                      onTap: () => sharePost(context, ref, p),
                    ),
                    0,
                  ),
                ],
              ),
            ),
          ),
        ),
        // Owner 2026-10-13: the time sits left of Save, grey, in every role
        // and place; Save (the bookmark) is the right-most button.
        if (promotionId == null) ...[
          const SizedBox(width: AppSpacing.sm),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 96),
            child: Text(
              SocialFormat.ago(t, f, p.createdAt),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.caption.copyWith(
                color: colors.textSecondary,
                fontSize: 13,
              ),
            ),
          ),
        ],
        BounceIcon(
          active: p.savedByMe,
          activeIcon: AppIcons.bookmarkRounded,
          icon: AppIcons.bookmarkBorderRounded,
          activeColor: colors.gold,
          size: 24,
          extent: 34,
          label: t.t(p.savedByMe ? 'post.unsave' : 'post.save'),
          onTap: () => run(() => actions.toggleSave(p)),
        ),
      ],
    );

    if (inDetail) {
      // The open thread: avatar + name on one line, the text under it on the
      // full width, then the actions (Threads).
      return Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.md,
          AppSpacing.md,
          AppSpacing.md,
          AppSpacing.xs,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (showPin && p.pinSlot != null) pinLine(),
            Row(
              children: [
                avatar,
                const SizedBox(width: AppSpacing.md),
                Expanded(child: nameRow()),
              ],
            ),
            if (repostedBy != null) repostLine(),
            const SizedBox(height: AppSpacing.sm),
            textBlock,
            PostPracticeChips(post: p, inset: 0),
            const SizedBox(height: AppSpacing.xs),
            actionRow,
          ],
        ),
      );
    }

    final card = AppPressable(
      onTap: open,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.md,
          AppSpacing.md,
          AppSpacing.md,
          AppSpacing.xs,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (showPin && p.pinSlot != null) pinLine(),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                avatar,
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      nameRow(compact: repostedBy != null),
                      if (repostedBy != null) repostLine(),
                      textBlock,
                      PostPracticeChips(post: p, inset: 0),
                    ],
                  ),
                ),
              ],
            ),
            // Owner 2026-10-13: the actions start on the avatar's line, so
            // big counts still fit before the time and Save.
            actionRow,
          ],
        ),
      ),
    );
    return card;
  }
}

class _TimeLine extends ConsumerWidget {
  const _TimeLine({required this.post});

  final Post post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        0,
        AppSpacing.lg,
        AppSpacing.sm,
      ),
      child: Row(
        children: [
          Flexible(
            child: Text(
              SocialFormat.ago(t, f, post.createdAt),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          // Next to Save only the globe (with its label for screen
          // readers) so the time is never cut.
          Semantics(
            label: t.t('post.public'),
            child: AppIcon(
              AppIcons.publicRounded,
              size: 14,
              color: colors.textSecondary,
            ),
          ),
          const SizedBox(width: AppSpacing.xs),
          Flexible(
            child: Text(
              t.t('post.public'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}

/// The post's bold first line and the rest (the feed card's split), for
/// other views such as the Search grid.
(String, String) splitPostBody(String body) => PostCard._split(body);

/// Practice category a hashtag stands for (the client topic slider and
/// the main chip icon use the same map).
String? topicCategory(String tag) => switch (tag.toLowerCase()) {
      'immigration' || 'greencard' || 'visa' || 'asylum' => 'immigration',
      'familylaw' || 'divorce' || 'custody' || 'childcustody' => 'family_law',
      'traffic' ||
      'trafficticket' ||
      'speeding' ||
      'tickets' =>
        'traffic_tickets',
      'dui' || 'dwi' => 'dui_and_dwi',
      'criminaldefense' || 'criminal' => 'criminal_defense',
      'personalinjury' || 'injury' || 'caraccident' => 'personal_injury',
      'realestate' => 'real_estate',
      'employment' || 'workplace' => 'employment_and_labor',
      'bankruptcy' || 'debt' => 'bankruptcy_and_debt',
      // Every other practice's topic tag (owner 2026-09-30).
      _ => categoryForTopicTag(tag),
    };

/// "greencard" → "Green Card"; unknown tags get a capital letter.
String topicLabel(String tag) {
  const known = {
    'familylaw': 'Family Law',
    'trafficticket': 'Traffic Ticket',
    'greencard': 'Green Card',
    'personalinjury': 'Personal Injury',
    'criminaldefense': 'Criminal Defense',
    'dui': 'DUI',
    'realestate': 'Real Estate',
    'childcustody': 'Child Custody',
    'caraccident': 'Car Accident',
  };
  final k = known[tag.toLowerCase()];
  if (k != null) return k;
  // A practice topic tag (OQ-034): its category's name.
  final cat = categoryForTopicTag(tag);
  if (cat != null) return kPracticeCategoryNamesEn[cat] ?? tag;
  return tag.isEmpty ? tag : tag[0].toUpperCase() + tag.substring(1);
}

/// Topic chips (owner design): the post's qualification as the main navy
/// pill (tap → that qualification's posts), "News" when it is news, then
/// up to three quiet hashtag pills (tap → the topic page).
class _TopicChips extends ConsumerWidget {
  const _TopicChips({required this.tags, this.practice, this.news = false});

  final List<String> tags;
  final PostPractice? practice;
  final bool news;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget pill({
      required String label,
      required bool main,
      required VoidCallback? onTap,
      IconData? icon,
      bool gold = false,
    }) =>
        AppPressable(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.xs + 2,
            ),
            decoration: BoxDecoration(
              color: gold
                  ? colors.goldTint
                  : (main
                      ? colors.navy
                      : colors.textSecondary.withValues(alpha: 0.10)),
              borderRadius: BorderRadius.circular(AppRadii.pill),
              border: gold ? Border.all(color: colors.goldStroke) : null,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[
                  AppIcon(
                    icon,
                    size: 15,
                    color: gold ? colors.goldDark : colors.goldLight,
                  ),
                  const SizedBox(width: AppSpacing.xs),
                ],
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: typography.caption.copyWith(
                      color: gold
                          ? colors.goldDark
                          : (main ? Colors.white : colors.textSecondary),
                      fontWeight:
                          main || gold ? FontWeight.w600 : FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
    final pr = practice;
    final quietTags = pr == null ? tags.skip(1).take(3) : tags.take(3);
    final topics = Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xs,
      children: [
        if (pr != null)
          pill(
            label: CaseFormat.practice(t, pr.i18nKey, pr.nameEn),
            main: true,
            icon: practiceGlyph(pr.categoryCode),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => PracticePostsScreen(practice: pr.code),
              ),
            ),
          )
        else if (tags.isNotEmpty)
          pill(
            label: topicLabel(tags.first),
            main: true,
            icon: practiceGlyph(topicCategory(tags.first)),
            onTap: () => context.push(SocialRoutes.tag(tags.first)),
          ),
        for (final tag in quietTags)
          pill(
            label: topicLabel(tag),
            main: false,
            onTap: () => context.push(SocialRoutes.tag(tag)),
          ),
      ],
    );
    // Owner 2026-10-06: no "News" label while News is off.
    if (!news || !ref.watch(newsEnabledProvider)) return topics;
    // Owner 2026-09-30: "News" sits at the right edge of the row, where
    // the Save button lines up below.
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: topics),
        const SizedBox(width: AppSpacing.sm),
        // Bounded so the pill's Flexible label can ellipsize.
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 140),
          child: pill(
            label: t.t('post.kind.news'),
            main: false,
            gold: true,
            icon: AppIcons.newspaperRounded,
            // A label, not a filter: there is no news-only route.
            onTap: null,
          ),
        ),
      ],
    );
  }
}

class _AuthorRow extends ConsumerWidget {
  const _AuthorRow({
    required this.post,
    this.sponsored = false,
    this.compact = false,
    this.onDark = false,
  });

  /// White text and icons (the row over a reel's video).
  final bool onDark;

  final Post post;

  /// Owner 2026-10-12: the practice card's slim header — avatar, name,
  /// check, role and the menu only (no Follow button).
  final bool compact;

  /// Owner 2026-10-05: a paid promoted post says «Реклама» under the name.
  final bool sponsored;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final a = post.author;
    return Padding(
      padding: EdgeInsetsDirectional.fromSTEB(
        compact ? AppSpacing.md : AppSpacing.lg,
        compact ? 6 : AppSpacing.md,
        AppSpacing.xs,
        compact ? 6 : AppSpacing.md,
      ),
      child: AuthorHeader(
        author: a,
        onDark: onDark,
        avatarSize: 32,
        gap: compact ? 10 : AppSpacing.md,
        followMaxWidth: compact ? 120 : 136,
        // Only on someone else's post.
        showFollow: !post.isMine,
        boostPostId: post.isMine ? post.id : null,
        // Owner 2026-10-13: no qualifications under the name.
        subtitle: sponsored
            ? t.t('promote.sponsored')
            : post.locationName ??
                (a.isClient
                    ? '@${a.username} · ${t.t('person.client')}'
                    : a.verified
                        ? t.t('post.licensedAttorney')
                        : '@${a.username}'),
        trailing: AppIconButton(
          icon: AppIcon(
            AppIcons.moreHorizRounded,
            color: onDark ? Colors.white : null,
          ),
          semanticLabel: t.t('post.menu'),
          onPressed: () => showPostMenu(context, ref, post),
        ),
      ),
    );
  }
}

/// Owner 2026-10-12: in the author's own feed of posts (no author row) the
/// "…" menu stays reachable (pin, edit, delete), with "Pinned" on the left.
class _OwnMenuRow extends ConsumerWidget {
  const _OwnMenuRow({required this.post});

  final Post post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsetsDirectional.only(
        start: AppSpacing.lg,
        end: AppSpacing.xs,
      ),
      child: Row(
        children: [
          if (post.pinSlot != null) ...[
            AppIcon(AppIcons.pushPin, size: 14, color: colors.textSecondary),
            const SizedBox(width: AppSpacing.xs),
            Text(
              t.t('post.pinned'),
              style: type.caption.copyWith(
                color: colors.textSecondary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const Spacer(),
          AppIconButton(
            icon: const AppIcon(AppIcons.moreHorizRounded),
            semanticLabel: t.t('post.menu'),
            onPressed: () => showPostMenu(context, ref, post),
          ),
        ],
      ),
    );
  }
}

/// docs/05 §2.4 "синяя галочка" next to verified attorneys.
/// The one author row of the app (feed card, reel card, inner card, Reels
/// player): avatar with its ring, the name on ONE line with the check right
/// after it, a grey line under it, and the small Follow pill at the right
/// edge of the same row (at least 12dp from the name). [trailing] is the
/// "…" menu where the surface has one.
class AuthorHeader extends ConsumerWidget {
  const AuthorHeader({
    required this.author,
    required this.subtitle,
    required this.showFollow,
    this.avatarSize = 40,
    this.onDark = false,
    this.shadows,
    this.trailing,
    this.followMaxWidth = 136,
    this.gap = AppSpacing.md,
    this.preferPractices = false,
    this.boostPostId,
    super.key,
  });

  /// Owner 2026-10-14: on my own post / reel the Boost button sits where
  /// Follow sits on someone else's (never both).
  final String? boostPostId;

  /// Under the name: the attorney's practices ("A · B +1") when there
  /// are any, instead of [subtitle].
  final bool preferPractices;

  final PostAuthor author;
  final String subtitle;
  final bool showFollow;
  final double avatarSize;

  /// White text over a video.
  final bool onDark;
  final List<Shadow>? shadows;
  final Widget? trailing;
  final double followMaxWidth;
  final double gap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = author;
    return Row(
      children: [
        Expanded(
          child: Semantics(
            button: true,
            label: t.t('post.author.open', {'name': a.displayName}),
            child: AppPressable(
              onTap: () => openAuthorProfile(context, ref, a),
              child: Row(
                children: [
                  IdentityAvatar(
                    id: a.id,
                    url: a.avatarUrl,
                    initials: a.initials,
                    size: avatarSize,
                    ring: a.verified,
                    trustLevel: a.isClient ? 0 : a.trustLevel,
                    rejected: !a.isClient && a.identityRejected,
                  ),
                  SizedBox(width: gap),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        AuthorNameLine(
                          name: a.displayName,
                          verified: a.verified,
                          gold: a.isClient,
                          checkLabel: t.t('post.verified'),
                          style: type.body.copyWith(
                            color: onDark ? Colors.white : colors.text,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            shadows: shadows,
                          ),
                        ),
                        if (preferPractices &&
                            !a.isClient &&
                            a.practiceKeys.isNotEmpty)
                          _AuthorPractices(
                            keys: a.practiceKeys,
                            color: onDark
                                ? Colors.white.withValues(alpha: 0.9)
                                : colors.textSecondary,
                            shadows: shadows,
                          )
                        else
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.caption.copyWith(
                              color: onDark
                                  ? Colors.white.withValues(alpha: 0.9)
                                  : colors.textSecondary,
                              fontSize: 12,
                              shadows: shadows,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (!showFollow &&
            boostPostId != null &&
            !ref.watch(isAssistantProvider)) ...[
          const SizedBox(width: 12),
          BoostButton(postId: boostPostId!),
        ],
        if (showFollow) ...[
          const SizedBox(width: 12),
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: followMaxWidth),
            child: onDark
                ? ReelFollowButton(
                    attorneyId: a.id,
                    initial: a.isFollowing,
                  )
                : FollowButton(
                    attorneyId: a.id,
                    initial: a.isFollowing,
                    outlined: true,
                  ),
          ),
        ],
        if (trailing != null) trailing!,
      ],
    );
  }
}

/// "Divorce · Family +1" under an author's name, on one line.
class _AuthorPractices extends ConsumerWidget {
  const _AuthorPractices({
    required this.keys,
    required this.color,
    this.shadows,
  });

  final List<String> keys;
  final Color color;
  final List<Shadow>? shadows;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final style = DefaultTextStyle.of(context)
        .style
        .merge(type.caption.copyWith(color: color, shadows: shadows));
    return LayoutBuilder(
      builder: (context, box) => Text(
        fitPracticeList(
          [for (final k in keys) practiceLabel(t, k)],
          style: style,
          maxWidth: box.maxWidth,
          maxLines: 1,
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: style,
      ),
    );
  }
}

/// The one author-name line used by every card and the Reels player: the
/// name on a single line ending in "…" when it is long, the check right
/// after it on the same line and never cut. (Follow sits at the row's
/// right edge, outside this widget.)
class AuthorNameLine extends StatelessWidget {
  const AuthorNameLine({
    required this.name,
    required this.verified,
    required this.checkLabel,
    required this.style,
    this.gold = false,
    this.checkSize = 16,
    super.key,
  });

  final String name;
  final bool verified;
  final String checkLabel;
  final TextStyle style;
  final bool gold;
  final double checkSize;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: style,
            ),
          ),
          if (verified) ...[
            const SizedBox(width: AppSpacing.xs),
            VerifiedCheck(label: checkLabel, size: checkSize, gold: gold),
          ],
        ],
      );
}

class VerifiedCheck extends StatelessWidget {
  const VerifiedCheck({
    required this.label,
    this.size = 16,
    this.gold = false,
    super.key,
  });

  final String label;
  final double size;

  /// Owner 2026-10-13: there is no blue check — the verified check is gold
  /// for everyone (kept for call sites; the colour no longer depends on it).
  final bool gold;

  @override
  Widget build(BuildContext context) {
    // Owner 2026-10-13: the only check is the client's gold one (active
    // subscription). Attorneys have none — their sign is the green Identity
    // badge on the avatar.
    if (!gold) return const SizedBox.shrink();
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      label: label,
      child: AppIcon(
        AppIcons.verifiedUserOutlined,
        size: size,
        color: colors.goldAccent,
      ),
    );
  }
}

/// An avatar with a thin gold ring for verified attorneys.
class GoldRingAvatar extends StatelessWidget {
  const GoldRingAvatar({
    required this.initials,
    required this.size,
    this.url,
    this.ring = false,
    super.key,
  });

  final String? url;
  final String initials;
  final double size;
  final bool ring;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final avatar = AppAvatar(
      imageProvider: url == null
          ? null
          : CachedNetworkImageProvider(
              url!,
              // Signed URLs change per request: cache by the stable path.
              cacheKey: Uri.parse(url!).path,
            ),
      initials: initials,
      size: ring ? size - 4 : size,
    );
    if (!ring) return avatar;
    return Container(
      width: size,
      height: size,
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [colors.goldLight, colors.gold, colors.goldDark],
        ),
      ),
      child: avatar,
    );
  }
}

class PostBodyText extends ConsumerStatefulWidget {
  const PostBodyText({
    required this.body,
    this.expanded = false,
    this.large = false,
    this.mentions = const [],
    this.height = 1.45,
    this.style,
    this.leading,
    this.onLeadingTap,
    this.collapsedLines = 3,
    this.onMore,
    super.key,
  });

  /// Owner 2026-10-07: in the feed the text never grows in place; "more"
  /// (or a tap on the text) opens the post with the whole text instead.
  final VoidCallback? onMore;

  /// Overrides the text style (the post's title line).
  final TextStyle? style;

  /// Owner 2026-10-06: the author's name in bold before the caption
  /// (Instagram); [onLeadingTap] opens their profile.
  final String? leading;
  final VoidCallback? onLeadingTap;

  /// Lines shown before "more".
  final int collapsedLines;

  final String body;

  /// OQ-042: real people among the @handles — tappable, open the profile.
  final List<Mention> mentions;

  final double height;
  final bool expanded;
  final bool large;

  @override
  ConsumerState<PostBodyText> createState() => _PostBodyTextState();
}

class _PostBodyTextState extends ConsumerState<PostBodyText> {
  /// Pasted runs of empty lines collapse to one (owner 2026-10-07).
  String get _body => tidyText(widget.body);
  static final _token =
      RegExp(r'(#[\p{L}\p{N}_]+|@[A-Za-z0-9._]+)', unicode: true);
  late bool _expanded = widget.expanded;
  final _recognizers = <TapGestureRecognizer>[];

  @override
  void dispose() {
    for (final r in _recognizers) {
      r.dispose();
    }
    super.dispose();
  }

  List<InlineSpan> _spans(AppColorTokens colors, [String? override]) {
    final body = override ?? _body;
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
    final spans = <InlineSpan>[];
    final lead = widget.leading;
    if (lead != null && lead.isNotEmpty) {
      final onTap = widget.onLeadingTap;
      TapGestureRecognizer? r;
      if (onTap != null) {
        r = TapGestureRecognizer()..onTap = onTap;
        _recognizers.add(r);
      }
      spans
        ..add(
          TextSpan(
            text: lead,
            style: TextStyle(color: colors.text, fontWeight: FontWeight.w700),
            recognizer: r,
          ),
        )
        ..add(const TextSpan(text: ' '));
    }
    var last = 0;
    for (final m in _token.allMatches(body)) {
      if (m.start > last) {
        spans.add(TextSpan(text: body.substring(last, m.start)));
      }
      final token = m.group(0)!;
      if (token.startsWith('#')) {
        final tag = token.substring(1).toLowerCase();
        final r = TapGestureRecognizer()
          ..onTap = () => context.push(SocialRoutes.tag(tag));
        _recognizers.add(r);
        spans.add(
          TextSpan(
            text: token,
            style:
                TextStyle(color: colors.goldDark, fontWeight: FontWeight.w600),
            recognizer: r,
          ),
        );
      } else {
        // "@anna." at the end of a sentence: the dot is not the name.
        final trimmed = token.replaceFirst(RegExp(r'\.+$'), '');
        final tail = token.substring(trimmed.length);
        final handle = trimmed.substring(1).toLowerCase();
        final who =
            widget.mentions.where((x) => x.username == handle).firstOrNull;
        if (who == null) {
          spans.add(
            TextSpan(
              text: trimmed,
              style: TextStyle(color: colors.text, fontWeight: FontWeight.w600),
            ),
          );
        } else {
          final r = TapGestureRecognizer()
            ..onTap = () => context.push(
                  who.isAttorney
                      ? AppRoutes.lawyer(who.username)
                      : AppRoutes.client(who.username),
                );
          _recognizers.add(r);
          spans.add(
            TextSpan(
              text: trimmed,
              style: TextStyle(
                color: colors.goldDark,
                fontWeight: FontWeight.w700,
              ),
              recognizer: r,
            ),
          );
        }
        if (tail.isNotEmpty) spans.add(TextSpan(text: tail));
      }
      last = m.end;
    }
    if (last < body.length) {
      spans.add(TextSpan(text: body.substring(last)));
    }
    return spans;
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final style = widget.style ??
        (widget.large ? type.body : type.bodySmall)
            .copyWith(color: colors.text, height: widget.height);
    final text = Text.rich(
      TextSpan(children: _spans(colors), style: style),
      maxLines: _expanded ? null : widget.collapsedLines,
      overflow: _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
    );
    if (_expanded) return text;
    return LayoutBuilder(
      builder: (context, box) {
        final measured = DefaultTextStyle.of(context).style.merge(style);
        final painter = TextPainter(
          text: TextSpan(
            text: widget.leading == null ? _body : '${widget.leading} $_body',
            style: measured,
          ),
          maxLines: widget.collapsedLines,
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
        )..layout(maxWidth: box.maxWidth);
        if (!painter.didExceedMaxLines) return text;
        final more = widget.onMore ?? () => setState(() => _expanded = true);
        // "… more" ends the last allowed line (Instagram-like), never a
        // line of its own.
        final moreLabel = t.t('post.more');
        final lead = widget.leading == null ? '' : '${widget.leading} ';
        final bodyText = _body;
        bool fits(int n) {
          final shown = n >= bodyText.length
              ? bodyText
              : '${bodyText.substring(0, n).trimRight()}…';
          final p = TextPainter(
            text: TextSpan(text: '$lead$shown $moreLabel', style: measured),
            maxLines: widget.collapsedLines,
            textDirection: Directionality.of(context),
            textScaler: MediaQuery.textScalerOf(context),
          )..layout(maxWidth: box.maxWidth);
          return !p.didExceedMaxLines;
        }

        var lo = 0;
        var hi = bodyText.length;
        while (lo < hi) {
          final mid = (lo + hi + 1) ~/ 2;
          if (fits(mid)) {
            lo = mid;
          } else {
            hi = mid - 1;
          }
        }
        final cutText = '${bodyText.substring(0, lo).trimRight()}…';
        final moreRecognizer = TapGestureRecognizer()..onTap = more;
        _recognizers.add(moreRecognizer);
        return GestureDetector(
          onTap: widget.onMore == null ? null : more,
          child: Text.rich(
            TextSpan(
              style: style,
              children: [
                ..._spans(colors, cutText),
                const TextSpan(text: ' '),
                TextSpan(
                  text: moreLabel,
                  style: style.copyWith(color: colors.textSecondary),
                  recognizer: moreRecognizer,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Photos of a post: swipe between them, a gold pill page indicator, and
/// double tap = like with a heart that blooms and fades (§2.4).
class PostMediaCarousel extends StatefulWidget {
  const PostMediaCarousel({
    required this.media,
    required this.onDoubleTap,
    required this.semanticLabel,
    this.compact = false,
    this.fill = false,
    this.inList = false,
    this.onTap,
    this.onPage,
    this.showDots = true,
    super.key,
  });

  /// In a list (not the opened post): at most square.
  final bool inList;

  /// The visible photo changed (the feed card draws its own indicators).
  final ValueChanged<int>? onPage;

  /// The gold dots over the photo; the feed card puts them below it.
  final bool showDots;

  /// Tap on photo `index` (the open post shows the full-screen gallery).
  final void Function(int index)? onTap;

  final List<PostMedia> media;
  final VoidCallback onDoubleTap;
  final String semanticLabel;

  /// Owner 2026-09-30: in the feed a whole card must fit on one screen, so
  /// the photo is a wide 2:1 band (cropped); the opened post keeps the
  /// photo's own aspect ratio.
  final bool compact;

  /// Fill the parent box (the feed card sizes it) instead of keeping a
  /// ratio.
  final bool fill;

  @override
  State<PostMediaCarousel> createState() => _PostMediaCarouselState();
}

class _PostMediaCarouselState extends State<PostMediaCarousel>
    with SingleTickerProviderStateMixin {
  late final AnimationController _heart = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 820),
  );
  final _page = ValueNotifier<int>(0);

  @override
  void dispose() {
    _heart.dispose();
    _page.dispose();
    super.dispose();
  }

  void _doubleTap() {
    HapticFeedback.lightImpact();
    widget.onDoubleTap();
    if (!context.reduceMotion) _heart.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final media = widget.media;
    final Widget gallery = GestureDetector(
      onDoubleTap: _doubleTap,
      child: Stack(
        fit: StackFit.expand,
        children: [
          PageView.builder(
            itemCount: media.length,
            onPageChanged: (i) {
              _page.value = i;
              widget.onPage?.call(i);
            },
            // Owner 2026-09-30: the whole photo is always visible — shown
            // "contain" over a blurred copy of itself filling the frame
            // (no half-cropped portraits). Tap in the open post = full
            // screen gallery.
            itemBuilder: (context, i) {
              final m = media[i];
              Widget img(BoxFit fit, String url, String key) =>
                  CachedNetworkImage(
                    imageUrl: url,
                    cacheKey: key,
                    // Screen width is enough; never decode the original.
                    memCacheWidth: fit == BoxFit.cover ? 96 : 1080,
                    fit: fit,
                    fadeInDuration: context.reduceMotion
                        ? Duration.zero
                        : AppMotion.stateChange,
                    placeholder: (_, __) =>
                        ColoredBox(color: colors.skeletonBase),
                    errorWidget: (_, __, ___) => ColoredBox(
                      color: colors.skeletonBase,
                      child: AppIcon(
                        AppIcons.imageNotSupportedOutlined,
                        color: colors.textSecondary,
                      ),
                    ),
                  );
              return GestureDetector(
                onTap: widget.onTap == null ? null : () => widget.onTap!(i),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ImageFiltered(
                      imageFilter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                      child: img(BoxFit.cover, m.previewUrl, '${m.fileId}:320'),
                    ),
                    ColoredBox(color: Colors.black.withValues(alpha: 0.18)),
                    img(BoxFit.cover, m.mediumUrl, '${m.fileId}:1080'),
                  ],
                ),
              );
            },
          ),
          IgnorePointer(child: _HeartBurst(animation: _heart)),
          if (media.length > 1 && widget.showDots)
            Positioned(
              left: 0,
              right: 0,
              bottom: AppSpacing.md,
              child: IgnorePointer(
                child: ValueListenableBuilder<int>(
                  valueListenable: _page,
                  builder: (context, page, _) =>
                      _Dots(count: media.length, index: page),
                ),
              ),
            ),
        ],
      ),
    );
    return Semantics(
      label: widget.semanticLabel,
      // In fill mode the parent (the feed card) decides the size.
      child: widget.fill
          ? gallery
          : AspectRatio(
              // PostMedia.aspectRatio is already bounded 4:5 … 1.91:1; longer
              // photos are cropped to the centre (cover), whole when opened.
              aspectRatio: widget.compact
                  ? 2
                  : widget.inList
                      ? media.first.listAspectRatio
                      : media.first.aspectRatio,
              child: gallery,
            ),
    );
  }
}

/// Double tap on the whole post = like (never unlike, like Instagram) with
/// the heart bursting in the middle of the card.
class DoubleTapLike extends StatefulWidget {
  const DoubleTapLike({required this.onLike, required this.child, super.key});

  final VoidCallback onLike;
  final Widget child;

  @override
  State<DoubleTapLike> createState() => _DoubleTapLikeState();
}

class _DoubleTapLikeState extends State<DoubleTapLike>
    with SingleTickerProviderStateMixin {
  late final AnimationController _heart = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 820),
  );

  @override
  void dispose() {
    _heart.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
        behavior: HitTestBehavior.translucent,
        onDoubleTap: () {
          HapticFeedback.lightImpact();
          widget.onLike();
          if (!context.reduceMotion) _heart.forward(from: 0);
        },
        child: Stack(
          children: [
            widget.child,
            Positioned.fill(
              child: IgnorePointer(child: _HeartBurst(animation: _heart)),
            ),
          ],
        ),
      );
}

class _HeartBurst extends StatelessWidget {
  const _HeartBurst({required this.animation});

  final Animation<double> animation;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return AnimatedBuilder(
      animation: animation,
      builder: (context, _) {
        final v = animation.value;
        if (v == 0 || v == 1) return const SizedBox.shrink();
        // Bloom (0–35%), hold, fade (70–100%).
        final scale = v < 0.35
            ? Curves.easeOutBack.transform(v / 0.35) * 1.1
            : 1.1 - 0.1 * ((v - 0.35) / 0.65).clamp(0, 1);
        final opacity = v < 0.7 ? 1.0 : 1 - (v - 0.7) / 0.3;
        return Center(
          child: Opacity(
            opacity: opacity.clamp(0, 1),
            child: Transform.scale(
              scale: scale,
              child: AppIcon(
                AppIcons.favoriteRounded,
                size: 108,
                color: Colors.white,
                shadows: [
                  Shadow(
                    color: colors.gold.withValues(alpha: 0.6),
                    blurRadius: 28,
                  ),
                  Shadow(color: colors.shadow, blurRadius: 12),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.index});

  final int count;
  final int index;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < count; i++)
          AnimatedContainer(
            duration:
                context.reduceMotion ? Duration.zero : AppMotion.stateChange,
            curve: AppMotion.enterCurve,
            margin: const EdgeInsets.symmetric(horizontal: 3),
            width: i == index ? 18 : 6,
            height: 6,
            decoration: BoxDecoration(
              color: i == index
                  ? colors.gold
                  : Colors.white.withValues(alpha: 0.7),
              borderRadius: BorderRadius.circular(AppRadii.pill),
            ),
          ),
      ],
    );
  }
}

class PostActionsBar extends ConsumerWidget {
  const PostActionsBar({
    required this.post,
    required this.run,
    this.showTime = false,
    this.showCounts = true,
    this.boost = true,
    this.reactions = true,
    super.key,
  });

  /// Owner 2026-10-12: inside an open post there are no like / comment /
  /// share icons — comments only through the sheet.
  final bool reactions;

  /// Owner 2026-10-07: «Продвигать» only on the cards in a list, never
  /// inside the open post.
  final bool boost;

  /// Owner 2026-10-06: Instagram-style posts show bare icons; the likes
  /// count sits on its own line below.
  final bool showCounts;

  final Post post;
  final Future<void> Function(Future<Object?> Function()) run;

  /// Feed card: "56 min ago · Public" left of the Save button.
  final bool showTime;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final actions = ref.read(socialActionsProvider);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
      child: Row(
        children: [
          // The icons and counters shrink as a group if huge numbers (or a
          // long language) don't fit; the date and Save keep their place.
          Flexible(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (reactions) ...[
                    BounceIcon(
                      size: _kBarIcon,
                      active: post.likedByMe,
                      activeIcon: AppIcons.favoriteRounded,
                      icon: AppIcons.favoriteBorderRounded,
                      activeColor: colors.danger,
                      label: t.t(post.likedByMe ? 'post.unlike' : 'post.like'),
                      onTap: () => run(() => actions.toggleLike(post)),
                    ),
                    // Owner 2026-10-15 (Instagram): no count next to like or
                    // send; the comments keep theirs.
                    BounceIcon(
                      size: _kBarIcon,
                      active: false,
                      activeIcon: AppIcons.modeCommentOutlined,
                      icon: AppIcons.modeCommentOutlined,
                      label: t.t('post.comments'),
                      onTap: () => showCommentsSheet(
                        context,
                        postId: post.id,
                        commentsEnabled: post.commentsEnabled,
                      ),
                    ),
                    if (showCounts && (showTime || post.commentCount > 0))
                      _Count(post.commentCount),
                    BounceIcon(
                      size: _kBarIcon,
                      active: false,
                      activeIcon: AppIcons.sendOutlined,
                      icon: AppIcons.sendOutlined,
                      label: t.t('post.share'),
                      onTap: () => sharePost(context, ref, post),
                    ),
                  ],
                ],
              ),
            ),
          ),
          // Owner 2026-09-30: the time and Save sit at the right edge.
          Expanded(
            child: showTime
                ? Align(
                    alignment: AlignmentDirectional.centerEnd,
                    child: _ShortDate(at: post.createdAt),
                  )
                : const SizedBox.shrink(),
          ),
          BounceIcon(
            size: _kBarIcon + 2,
            active: post.savedByMe,
            activeIcon: AppIcons.bookmarkRounded,
            icon: AppIcons.bookmarkBorderRounded,
            activeColor: colors.gold,
            label: t.t(post.savedByMe ? 'post.unsave' : 'post.save'),
            onTap: () => run(() => actions.toggleSave(post)),
          ),
        ],
      ),
    );
  }
}

class _Count extends ConsumerWidget {
  const _Count(this.value);

  final int value;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
      child: Text(
        SocialFormat.count(f, value),
        style: type.bodySmall.copyWith(
          color: colors.text,
          fontWeight: FontWeight.w500,
          fontSize: 13,
        ),
      ),
    );
  }
}

/// Owner 2026-10-14: Instagram-size icons in the action bar (22).
const double _kBarIcon = 22;

/// A 48x48 action icon that pops (1 → 1.28 → 1) when it turns active.
class BounceIcon extends StatefulWidget {
  const BounceIcon({
    required this.active,
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.onTap,
    this.activeColor,
    this.size = 26,
    this.extent = AppSizes.touchTarget,
    super.key,
  });

  /// The tap target's width (its height stays a touch target).
  final double extent;

  final bool active;
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final VoidCallback onTap;
  final Color? activeColor;
  final double size;

  @override
  State<BounceIcon> createState() => _BounceIconState();
}

class _BounceIconState extends State<BounceIcon>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 360),
  );
  late final Animation<double> _scale = TweenSequence<double>([
    TweenSequenceItem(tween: Tween<double>(begin: 1, end: 1.28), weight: 40),
    TweenSequenceItem(
      tween: Tween<double>(begin: 1.28, end: 1)
          .chain(CurveTween(curve: Curves.elasticOut)),
      weight: 60,
    ),
  ]).animate(_c);

  @override
  void didUpdateWidget(BounceIcon old) {
    super.didUpdateWidget(old);
    if (widget.active && !old.active && !context.reduceMotion) {
      _c.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      toggled: widget.icon == widget.activeIcon ? null : widget.active,
      label: widget.label,
      excludeSemantics: true,
      child: AppTapTarget(
        child: AppPressable(
          onTap: () {
            HapticFeedback.selectionClick();
            widget.onTap();
          },
          child: SizedBox(
            width: widget.extent,
            height: AppSizes.touchTarget,
            child: Center(
              child: ScaleTransition(
                scale: _scale,
                child: AnimatedSwitcher(
                  duration: context.reduceMotion
                      ? Duration.zero
                      : const Duration(milliseconds: 160),
                  transitionBuilder: (child, a) =>
                      FadeTransition(opacity: a, child: child),
                  child: AppIcon(
                    widget.active ? widget.activeIcon : widget.icon,
                    key: ValueKey(widget.active),
                    size: widget.size,
                    color: widget.active
                        ? (widget.activeColor ?? colors.text)
                        : colors.text,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Skeleton of a post card (loading state).
class PostCardSkeleton extends StatelessWidget {
  const PostCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
      ),
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AppSkeleton(
                width: AppSizes.cardAvatar,
                height: AppSizes.cardAvatar,
                borderRadius: AppRadii.pill,
              ),
              SizedBox(width: AppSpacing.md),
              Expanded(child: AppSkeleton()),
            ],
          ),
          SizedBox(height: AppSpacing.lg),
          AspectRatio(
            aspectRatio: 1,
            child: AppSkeleton(borderRadius: AppRadii.card),
          ),
          SizedBox(height: AppSpacing.lg),
          AppSkeleton(width: 160),
          SizedBox(height: AppSpacing.sm),
          AppSkeleton(),
        ],
      ),
    );
  }
}

/// The disclaimer under the composer and on the post screen (§2.4).
class PostDisclaimer extends ConsumerWidget {
  const PostDisclaimer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppIcon(
          AppIcons.infoOutlineRounded,
          size: AppSizes.iconSm,
          color: colors.textSecondary,
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            t.t('post.disclaimer'),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
        ),
      ],
    );
  }
}

/// Owner 2026-10-12: the small grey date left of Save ("2d", "Mar 14",
/// "Mar 14, 2024").
class _ShortDate extends ConsumerWidget {
  const _ShortDate({required this.at});

  final DateTime at;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsetsDirectional.symmetric(horizontal: AppSpacing.xs),
      child: Text(
        SocialFormat.shortDate(t, f, at),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: type.caption.copyWith(color: colors.textSecondary, fontSize: 13),
      ),
    );
  }
}

/// Several photos: a "1/5" counter over the top right corner and the
/// page dots under the photo (owner 2026-10-12, Instagram).
class _FeedCarousel extends StatefulWidget {
  const _FeedCarousel({
    required this.media,
    required this.semanticLabel,
    required this.onDoubleTap,
    required this.onTap,
    required this.fill,
  });

  final List<PostMedia> media;
  final String semanticLabel;
  final VoidCallback onDoubleTap;
  final VoidCallback onTap;

  /// Fill the height the card gives (otherwise a 1:1.25 box).
  final bool fill;

  @override
  State<_FeedCarousel> createState() => _FeedCarouselState();
}

class _FeedCarouselState extends State<_FeedCarousel> {
  int _page = 0;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final count = widget.media.length;
    Widget box(Widget child) => widget.fill
        ? Expanded(child: child)
        : AspectRatio(aspectRatio: 1 / 1.25, child: child);
    return Column(
      mainAxisSize: widget.fill ? MainAxisSize.max : MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        box(
          Stack(
            fit: StackFit.expand,
            children: [
              PostMediaCarousel(
                media: widget.media,
                semanticLabel: widget.semanticLabel,
                fill: true,
                showDots: false,
                onDoubleTap: widget.onDoubleTap,
                onTap: (_) => widget.onTap(),
                onPage: (i) => setState(() => _page = i),
              ),
              Positioned(
                top: 10,
                right: 10,
                child: IgnorePointer(
                  child: ExcludeSemantics(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: colors.navy.withValues(alpha: 0.78),
                        borderRadius: BorderRadius.circular(AppRadii.pill),
                      ),
                      child: Text(
                        '${_page + 1}/$count',
                        style: type.caption.copyWith(
                          color: Colors.white,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: ExcludeSemantics(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < count; i++)
                  Container(
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i == _page ? colors.gold : colors.border,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Owner 2026-10-12: the post's qualifications under the actions — the
/// practice, its sub-practice and the other topics its hashtags name (no
/// limit), all alike and light: no dot, radius 6, aligned with the text,
/// one row that scrolls sideways when it does not fit.
class PostPracticeChips extends ConsumerWidget {
  const PostPracticeChips({
    required this.post,
    this.inset = AppSpacing.md,
    super.key,
  });

  final Post post;

  /// Side padding of the chip row (zero inside the Threads text column).
  final double inset;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final pr = post.practice;
    final chips = <(String, VoidCallback)>[];
    void add(String label, VoidCallback onTap) {
      if (!chips.any((c) => c.$1 == label)) {
        chips.add((label, onTap));
      }
    }

    void openPractice(String code) => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => PracticePostsScreen(practice: code),
          ),
        );
    // A post without a practice has no chip row.
    if (pr == null) return const SizedBox.shrink();
    final isSub = pr.code.contains('.');
    final own = CaseFormat.practice(t, pr.i18nKey, pr.nameEn);
    add(
      isSub ? (kPracticeCategoryNamesEn[pr.categoryCode] ?? own) : own,
      () => openPractice(pr.categoryCode),
    );
    if (isSub) add(own, () => openPractice(pr.code));
    for (final tag in post.tags) {
      final cat = topicCategory(tag);
      if (cat != null) {
        add(
          kPracticeCategoryNamesEn[cat] ?? topicLabel(tag),
          () => context.push(SocialRoutes.tag(tag)),
        );
      }
    }
    if (chips.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: EdgeInsets.symmetric(horizontal: inset),
        child: Row(
          children: [
            for (final (i, c) in chips.indexed) ...[
              if (i > 0) const SizedBox(width: 6),
              AppPressable(
                onTap: c.$2,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: colors.textSecondary.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    c.$1,
                    maxLines: 1,
                    style: type.caption.copyWith(
                      fontSize: 11.5,
                      height: 18 / 11.5,
                      fontWeight: FontWeight.w600,
                      color: colors.text,
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Owner 2026-10-12: the title (one line) and two lines of text with a
/// grey "more" at the end of the second line. A short text (up to 4 lines)
/// opens in place and then shows the hashtags; a longer one opens the post.
class _FeedCaption extends ConsumerStatefulWidget {
  const _FeedCaption({
    required this.title,
    required this.text,
    required this.hashtags,
    required this.onOpen,
    this.onExpand,
    this.inPlaceOnly = false,
    this.onMore,
    super.key,
  });

  /// With [inPlaceOnly]: opens the description sheet.
  final VoidCallback? onMore;

  /// Owner 2026-10-13: a post without an inner card — a long text opens in
  /// place too, nothing else opens.
  final bool inPlaceOnly;

  final String title;
  final String text;
  final List<String> hashtags;
  final VoidCallback onOpen;

  /// The text opened in place (the card gives up its fixed height).
  final VoidCallback? onExpand;

  @override
  ConsumerState<_FeedCaption> createState() => _FeedCaptionState();
}

class _FeedCaptionState extends ConsumerState<_FeedCaption> {
  bool _expanded = false;
  final _more = TapGestureRecognizer();
  final _tagTaps = <TapGestureRecognizer>[];

  @override
  void dispose() {
    _more.dispose();
    for (final r in _tagTaps) {
      r.dispose();
    }
    super.dispose();
  }

  /// The longest start of [text] that, followed by [tail], fits two lines.
  int _fit(
    String text,
    String tail,
    TextStyle style,
    double width,
    BuildContext context,
  ) {
    bool fits(int n) {
      final p = TextPainter(
        text: TextSpan(
          text: n >= text.length
              ? '$text $tail'
              : '${text.substring(0, n).trimRight()}$tail',
          style: DefaultTextStyle.of(context).style.merge(style),
        ),
        maxLines: 2,
        textDirection: Directionality.of(context),
        textScaler: MediaQuery.textScalerOf(context),
      )..layout(maxWidth: width);
      return !p.didExceedMaxLines;
    }

    if (fits(text.length)) return text.length;
    var lo = 0;
    var hi = text.length;
    while (lo < hi) {
      final mid = (lo + hi + 1) ~/ 2;
      if (fits(mid)) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final titleStyle = type.titleMedium.copyWith(
      color: colors.text,
      fontSize: 14,
      fontWeight: FontWeight.w600,
      height: 1.25,
    );
    final bodyStyle = type.bodySmall.copyWith(
      color: colors.text.withValues(alpha: 0.8),
      fontSize: 13.5,
      height: 1.4,
    );
    final moreStyle = bodyStyle.copyWith(
      color: colors.textSecondary,
      fontWeight: FontWeight.w500,
    );
    final hasText = widget.text.isNotEmpty;
    final hasTags = widget.hashtags.isNotEmpty;
    for (final r in _tagTaps) {
      r.dispose();
    }
    _tagTaps.clear();
    final tags = hasTags
        ? Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text.rich(
              TextSpan(
                children: [
                  for (final (i, tag) in widget.hashtags.indexed) ...[
                    if (i > 0) const TextSpan(text: ' '),
                    TextSpan(
                      text: tag,
                      recognizer: () {
                        final r = TapGestureRecognizer()
                          ..onTap = () =>
                              context.push(SocialRoutes.tag(tag.substring(1)));
                        _tagTaps.add(r);
                        return r;
                      }(),
                    ),
                  ],
                ],
              ),
              style: bodyStyle.copyWith(color: colors.textSecondary),
            ),
          )
        : const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.md, 8, AppSpacing.md, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (widget.title.isNotEmpty)
            AppPressable(
              onTap: widget.onOpen,
              child: Text(
                widget.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: titleStyle,
              ),
            ),
          if (hasText)
            LayoutBuilder(
              builder: (context, box) {
                final painter = TextPainter(
                  text: TextSpan(
                    text: widget.text,
                    style: DefaultTextStyle.of(context).style.merge(bodyStyle),
                  ),
                  textDirection: Directionality.of(context),
                  textScaler: MediaQuery.textScalerOf(context),
                )..layout(maxWidth: box.maxWidth);
                final lines = painter.computeLineMetrics().length;
                final collapsed = (lines > 2 || hasTags) && !_expanded;
                _more.onTap = () {
                  if (widget.inPlaceOnly) {
                    // Owner 2026-10-13: no inner card — «ещё» always opens
                    // the text sheet; the card keeps its height.
                    widget.onMore?.call();
                  } else if (lines > 4) {
                    widget.onOpen();
                  } else {
                    widget.onExpand?.call();
                    setState(() => _expanded = true);
                  }
                };
                final moreLabel = t.t('post.more');
                final cut = collapsed
                    ? _fit(
                        widget.text,
                        '… $moreLabel',
                        bodyStyle,
                        box.maxWidth - 4,
                        context,
                      )
                    : widget.text.length;
                final shown = !collapsed
                    ? widget.text
                    : cut < widget.text.length
                        ? '${widget.text.substring(0, cut).trimRight()}… '
                        : '${widget.text} ';
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: GestureDetector(
                        onTap: widget.onOpen,
                        child: Text.rich(
                          TextSpan(
                            style: bodyStyle,
                            children: [
                              TextSpan(text: shown),
                              if (collapsed)
                                TextSpan(
                                  text: moreLabel,
                                  style: moreStyle,
                                  recognizer: _more,
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    if (_expanded) tags,
                  ],
                );
              },
            )
          else
            tags,
        ],
      ),
    );
  }
}

/// Owner 2026-10-12: document chips under the text (icon + name, the first
/// two and "+N"); a tap opens the post.
class _DocChips extends StatelessWidget {
  const _DocChips({required this.documents, required this.onOpen});

  final List<PostAttachment> documents;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final shown = documents.take(2).toList();
    final rest = documents.length - shown.length;
    Widget box(Widget child) => AppPressable(
          onTap: onOpen,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(
              color: colors.textSecondary.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: colors.border),
            ),
            child: child,
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.md, 8, AppSpacing.md, 0),
      child: LayoutBuilder(
        builder: (context, box0) => Row(
          children: [
            for (final d in shown) ...[
              Flexible(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: box0.maxWidth * 0.62),
                  child: box(
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AppIcon(
                          AppIcons.descriptionOutlined,
                          size: 14,
                          color: colors.gold,
                        ),
                        const SizedBox(width: 5),
                        Flexible(
                          child: Text(
                            d.fileName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.caption.copyWith(
                              color: colors.text,
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 6),
            ],
            if (rest > 0)
              box(
                Text(
                  '+$rest',
                  style: type.caption.copyWith(
                    color: colors.text,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// A card of the given height (the photo takes the rest) until its text is
/// opened in place; then it keeps its natural height.
class _FeedFill extends StatefulWidget {
  const _FeedFill({required this.height, required this.builder});

  final double? height;
  final Widget Function({
    required bool fill,
    required VoidCallback onExpand,
  }) builder;

  @override
  State<_FeedFill> createState() => _FeedFillState();
}

class _FeedFillState extends State<_FeedFill> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final fill = widget.height != null && !_expanded;
    final body = widget.builder(
      fill: fill,
      onExpand: () => setState(() => _expanded = true),
    );
    return fill ? SizedBox(height: widget.height, child: body) : body;
  }
}
