import 'dart:ui' show ImageFilter;
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart'
    show FollowButton;
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart'
    show PracticePostsScreen;
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/social/social_routes.dart';

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
class PostCard extends ConsumerWidget {
  const PostCard({
    required this.post,
    this.inDetail = false,
    this.feedHeight,
    super.key,
  });

  final Post post;

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

    // At large text sizes the text alone may need the whole screen: then
    // the card keeps its natural height instead of squeezing the photo.
    final fill = feedHeight != null &&
        !inDetail &&
        MediaQuery.textScalerOf(context).scale(10) <= 13;
    // Owner 2026-09-30: feed cards run edge to edge (Instagram style):
    // no side border or rounded corners, hairlines on top and bottom.
    final edge = feedHeight != null && !inDetail;
    return Container(
      height: fill ? feedHeight : null,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: edge ? null : BorderRadius.circular(AppRadii.card),
        border: edge
            ? Border.symmetric(horizontal: BorderSide(color: colors.border))
            : Border.all(color: colors.border),
        boxShadow: [
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
        child: inDetail
            ? _detail(context, ref, p, t, colors, actions, run)
            : _feed(context, p, t, colors, run, fill: fill),
      ),
    );
  }

  /// Owner 2026-09-30 design (feed): author with Follow, topic chips,
  /// time, bold title, 4 lines of text + "Read more", the photo, actions.
  Widget _feed(
    BuildContext context,
    Post p,
    Translator t,
    AppColorTokens colors,
    Future<void> Function(Future<Object?> Function()) run, {
    required bool fill,
  }) {
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final (title, rest) = _titleAndRest(p);
    void open() => context.push(SocialRoutes.post(p.id));
    // Owner 2026-09-30: the author's photos (up to 9) or, when there are
    // none, the default art of the post's practice — full card width.
    final Widget picture = p.media.isNotEmpty
        ? PostMediaCarousel(
            media: p.media,
            semanticLabel: t.t('post.media.label'),
            // The card sizes the photo box (a 2:1 band or the rest of a
            // full-height card).
            fill: true,
            onDoubleTap: () => run(() => ProviderScope.containerOf(context)
                .read(socialActionsProvider)
                .like(p)),
          )
        : PracticePhoto(
            // Owner 2026-09-30: the post's qualification; older posts by
            // their topic hashtag.
            categoryCode: p.practice?.categoryCode ??
                p.tags
                    .map(topicCategory)
                    .firstWhere((c) => c != null, orElse: () => null),
            practiceCode: p.practice?.code,
          );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _AuthorRow(post: p),
        if (p.tags.isNotEmpty || p.practice != null || p.isNews)
          Padding(
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.sm),
            child: _TopicChips(
              tags: p.tags,
              practice: p.practice,
              news: p.isNews,
            ),
          ),
        AppPressable(
          onTap: open,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: typography.titleMedium.copyWith(
                    fontFamily: typography.body.fontFamily,
                    color: colors.text,
                    fontWeight: FontWeight.w700,
                    height: 1.25,
                  ),
                ),
                if (rest.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    rest,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: typography.body.copyWith(
                      color: colors.text,
                      height: 1.45,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Row(
                    children: [
                      Text(
                        t.t('post.readMore'),
                        style: typography.body.copyWith(
                          color: colors.goldDark,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      AppIcon(AppIcons.chevronRightRounded,
                          size: 20, color: colors.goldDark),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        if (fill)
          Expanded(child: AppPressable(onTap: open, child: picture))
        else
          AspectRatio(
            aspectRatio: 2,
            child: AppPressable(onTap: open, child: picture),
          ),
        // Owner 2026-09-30: time and "Public" sit next to Save.
        _ActionsBar(post: p, run: run, showTime: true),
        const SizedBox(height: AppSpacing.xs),
      ],
    );
  }

  /// Owner 2026-09-30: the post's own title and its whole text; older
  /// posts split their text.
  static (String, String) _titleAndRest(Post p) {
    final title = p.title;
    if (title != null && title.trim().isNotEmpty) {
      return (title.trim(), p.body.trim());
    }
    return _split(p.body);
  }

  /// "Title" = the first line (or sentence) of the post, the rest below.
  static (String, String) _split(String body) {
    final text = body.trim();
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
    final (title, rest) = _titleAndRest(p);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _AuthorRow(post: p),
        if (p.tags.isNotEmpty || p.practice != null || p.isNews)
          Padding(
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.md),
            child: _TopicChips(
              tags: p.tags,
              practice: p.practice,
              news: p.isNews,
            ),
          ),
        _TimeLine(post: p),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          // OQ-042: @mentions / #tags tappable in the title line too.
          child: PostBodyText(
            body: title,
            expanded: true,
            mentions: p.mentions,
            style: typography.titleLarge.copyWith(
              fontFamily: typography.body.fontFamily,
              color: colors.text,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        if (rest.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, 0),
            child:
                PostBodyText(body: rest, expanded: true, mentions: p.mentions),
          ),
        const SizedBox(height: AppSpacing.md),
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
        // Owner 2026-10-01: inside the post the comment field is right
        // below — no comment button (it only reopened the same post).
        _ActionsBar(post: p, run: run, showComment: false),
        if (p.likeCount > 0)
          Padding(
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xs),
            child: Text(
              SocialFormat.plural(
                  t, ref.watch(l10nFormatsProvider), 'post.likes', p.likeCount),
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
                AppSpacing.lg, AppSpacing.xs, AppSpacing.lg, 0),
            child: Row(
              children: [
                AppIcon(AppIcons.hourglassTopRounded,
                    size: 14, color: colors.textSecondary),
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
        if (!inDetail && p.commentCount > 0)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => context.push(SocialRoutes.post(p.id)),
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                foregroundColor: colors.textSecondary,
              ),
              child: Text(
                t.t('post.viewComments', {
                  'count': SocialFormat.count(
                      ref.watch(l10nFormatsProvider), p.commentCount)
                }),
              ),
            ),
          ),
        const SizedBox(height: AppSpacing.md),
      ],
    );
  }
}

/// "2 hours ago · Public" under the chips (owner design).
class _TimeLine extends ConsumerWidget {
  const _TimeLine({required this.post, this.inline = false});

  final Post post;

  /// In the actions row (no side padding, shrinks with ellipsis).
  final bool inline;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: inline
          ? const EdgeInsets.only(right: AppSpacing.xs)
          : const EdgeInsets.fromLTRB(
              AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.sm),
      child: Row(
        mainAxisSize: inline ? MainAxisSize.min : MainAxisSize.max,
        children: [
          Flexible(
            child: Text(SocialFormat.ago(t, f, post.createdAt),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.caption.copyWith(color: colors.textSecondary)),
          ),
          const SizedBox(width: AppSpacing.sm),
          // Next to Save only the globe (with its label for screen
          // readers) so the time is never cut.
          Semantics(
            label: t.t('post.public'),
            child: AppIcon(AppIcons.publicRounded,
                size: 14, color: colors.textSecondary),
          ),
          if (!inline) ...[
            const SizedBox(width: AppSpacing.xs),
            Text(t.t('post.public'),
                style: type.caption.copyWith(color: colors.textSecondary)),
          ],
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
      required VoidCallback onTap,
      IconData? icon,
      bool gold = false,
    }) =>
        AppPressable(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md, vertical: AppSpacing.xs + 2),
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
                  AppIcon(icon,
                      size: 15,
                      color: gold ? colors.goldDark : colors.goldLight),
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
            onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
              builder: (_) => PracticePostsScreen(practice: pr.code),
            )),
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
    if (!news) return topics;
    // Owner 2026-09-30: "News" sits at the right edge of the row, where
    // the Save button lines up below.
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: topics),
        const SizedBox(width: AppSpacing.sm),
        pill(
          label: t.t('post.kind.news'),
          main: false,
          gold: true,
          icon: AppIcons.newspaperRounded,
          onTap: () {},
        ),
      ],
    );
  }
}

class _AuthorRow extends ConsumerWidget {
  const _AuthorRow({required this.post});

  final Post post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = post.author;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg, AppSpacing.md, AppSpacing.xs, AppSpacing.md),
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              button: true,
              label: t.t('post.author.open', {'name': a.displayName}),
              child: AppPressable(
                onTap: () => context.push(a.isClient
                    ? AppRoutes.client(a.username)
                    : AppRoutes.lawyer(a.username)),
                child: Row(
                  children: [
                    GoldRingAvatar(
                      url: a.avatarUrl,
                      initials: a.initials,
                      size: AppSizes.cardAvatar,
                      ring: a.verified,
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  a.displayName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: type.body.copyWith(
                                    color: colors.text,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              if (a.verified) ...[
                                const SizedBox(width: AppSpacing.xs),
                                VerifiedCheck(label: t.t('post.verified')),
                              ],
                            ],
                          ),
                          Text(
                            a.isClient
                                ? '@${a.username} · ${t.t('person.client')}'
                                : a.verified
                                    ? t.t('post.licensedAttorney')
                                    : '@${a.username}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.caption
                                .copyWith(color: colors.textSecondary),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          // Owner 2026-09-30: a working Follow on the card.
          if (!post.isMine) ...[
            FollowButton(attorneyId: a.id, initial: a.isFollowing),
            const SizedBox(width: AppSpacing.xs),
          ],
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
class VerifiedCheck extends StatelessWidget {
  const VerifiedCheck({required this.label, this.size = 16, super.key});

  final String label;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      label: label,
      child: AppIcon(AppIcons.verifiedRounded, size: size, color: colors.info),
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
    super.key,
  });

  /// Overrides the text style (the post's title line).
  final TextStyle? style;

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

  List<InlineSpan> _spans(AppColorTokens colors) {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
    final spans = <InlineSpan>[];
    var last = 0;
    for (final m in _token.allMatches(widget.body)) {
      if (m.start > last) {
        spans.add(TextSpan(text: widget.body.substring(last, m.start)));
      }
      final token = m.group(0)!;
      if (token.startsWith('#')) {
        final tag = token.substring(1).toLowerCase();
        final r = TapGestureRecognizer()
          ..onTap = () => context.push(SocialRoutes.tag(tag));
        _recognizers.add(r);
        spans.add(TextSpan(
          text: token,
          style: TextStyle(color: colors.goldDark, fontWeight: FontWeight.w600),
          recognizer: r,
        ));
      } else {
        // "@anna." at the end of a sentence: the dot is not the name.
        final trimmed = token.replaceFirst(RegExp(r'\.+$'), '');
        final tail = token.substring(trimmed.length);
        final handle = trimmed.substring(1).toLowerCase();
        final who =
            widget.mentions.where((x) => x.username == handle).firstOrNull;
        if (who == null) {
          spans.add(TextSpan(
            text: trimmed,
            style: TextStyle(color: colors.text, fontWeight: FontWeight.w600),
          ));
        } else {
          final r = TapGestureRecognizer()
            ..onTap = () => context.push(who.isAttorney
                ? AppRoutes.lawyer(who.username)
                : AppRoutes.client(who.username));
          _recognizers.add(r);
          spans.add(TextSpan(
            text: trimmed,
            style:
                TextStyle(color: colors.goldDark, fontWeight: FontWeight.w700),
            recognizer: r,
          ));
        }
        if (tail.isNotEmpty) spans.add(TextSpan(text: tail));
      }
      last = m.end;
    }
    if (last < widget.body.length) {
      spans.add(TextSpan(text: widget.body.substring(last)));
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
      maxLines: _expanded ? null : 3,
      overflow: _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
    );
    if (_expanded) return text;
    return LayoutBuilder(builder: (context, box) {
      final painter = TextPainter(
        text: TextSpan(text: widget.body, style: style),
        maxLines: 3,
        textDirection: Directionality.of(context),
        textScaler: MediaQuery.textScalerOf(context),
      )..layout(maxWidth: box.maxWidth);
      if (!painter.didExceedMaxLines) return text;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          text,
          AppPressable(
            onTap: () => setState(() => _expanded = true),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              child: Text(
                t.t('post.more'),
                style: type.bodySmall.copyWith(color: colors.textSecondary),
              ),
            ),
          ),
        ],
      );
    });
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
    this.onTap,
    super.key,
  });

  /// Tap on photo [index] (the open post shows the full-screen gallery).
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
            onPageChanged: (i) => _page.value = i,
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
                    fit: fit,
                    fadeInDuration: context.reduceMotion
                        ? Duration.zero
                        : AppMotion.stateChange,
                    placeholder: (_, __) =>
                        ColoredBox(color: colors.skeletonBase),
                    errorWidget: (_, __, ___) => ColoredBox(
                      color: colors.skeletonBase,
                      child: AppIcon(AppIcons.imageNotSupportedOutlined,
                          color: colors.textSecondary),
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
                    img(BoxFit.contain, m.mediumUrl, '${m.fileId}:1080'),
                  ],
                ),
              );
            },
          ),
          IgnorePointer(child: _HeartBurst(animation: _heart)),
          if (media.length > 1)
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
              aspectRatio: widget.compact ? 2 : media.first.aspectRatio,
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
                      blurRadius: 28),
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

class _ActionsBar extends ConsumerWidget {
  const _ActionsBar({
    required this.post,
    required this.run,
    this.showTime = false,
    this.showComment = true,
  });

  final bool showComment;

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
          BounceIcon(
            active: post.likedByMe,
            activeIcon: AppIcons.favoriteRounded,
            icon: AppIcons.favoriteBorderRounded,
            activeColor: colors.danger,
            label: t.t(post.likedByMe ? 'post.unlike' : 'post.like'),
            onTap: () => run(() => actions.toggleLike(post)),
          ),
          // Owner 2026-09-30 design: counts next to the icons.
          if (post.likeCount > 0) _Count(post.likeCount),
          if (showComment) ...[
            BounceIcon(
              active: false,
              activeIcon: AppIcons.modeCommentOutlined,
              icon: AppIcons.modeCommentOutlined,
              label: t.t('post.comments'),
              onTap: () => context.push(SocialRoutes.post(post.id)),
            ),
            if (post.commentCount > 0) _Count(post.commentCount),
          ],
          BounceIcon(
            active: false,
            activeIcon: AppIcons.sendOutlined,
            icon: AppIcons.sendOutlined,
            label: t.t('post.share'),
            onTap: () => sharePost(context, ref, post),
          ),
          if (post.shareCount > 0) _Count(post.shareCount),
          // Owner 2026-09-30: the time and Save sit at the right edge.
          Expanded(
            child: showTime
                ? Align(
                    alignment: Alignment.centerRight,
                    child: _TimeLine(post: post, inline: true),
                  )
                : const SizedBox.shrink(),
          ),
          BounceIcon(
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
      padding: const EdgeInsets.only(right: AppSpacing.sm),
      child: Text(
        SocialFormat.count(f, value),
        style:
            type.body.copyWith(color: colors.text, fontWeight: FontWeight.w500),
      ),
    );
  }
}

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
    super.key,
  });

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
        weight: 60),
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
          child: SizedBox.square(
            dimension: AppSizes.touchTarget,
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
          Row(children: [
            AppSkeleton(
              width: AppSizes.cardAvatar,
              height: AppSizes.cardAvatar,
              borderRadius: AppRadii.pill,
            ),
            SizedBox(width: AppSpacing.md),
            Expanded(child: AppSkeleton(height: AppSpacing.lg)),
          ]),
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
    final Translator t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppIcon(AppIcons.infoOutlineRounded,
            size: AppSizes.iconSm, color: colors.textSecondary),
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
