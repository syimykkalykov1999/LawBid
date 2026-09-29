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
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/social/social_routes.dart';

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
    super.key,
  });

  final Post post;

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

    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
        boxShadow: [
          BoxShadow(
            color: colors.shadow,
            blurRadius: AppSizes.cardShadowBlur,
            offset: const Offset(0, AppSizes.cardShadowOffsetY),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _AuthorRow(post: p),
          if (p.media.isNotEmpty)
            PostMediaCarousel(
              media: p.media,
              semanticLabel: t.t('post.media.label'),
              onDoubleTap: () => run(() => actions.like(p)),
            )
          else
            _TextPanel(body: p.body),
          _ActionsBar(post: p, run: run),
          if (p.likeCount > 0)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xs),
              child: Text(
                t.plural('post.likes', p.likeCount),
                style: Theme.of(context)
                    .extension<AppTypographyTokens>()!
                    .bodySmall
                    .copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w600,
                    ),
              ),
            ),
          if (p.media.isNotEmpty && p.body.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xs),
              child: PostBodyText(
                body: p.body,
                expanded: inDetail,
              ),
            ),
          if (p.pendingReview)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg, AppSpacing.xs, AppSpacing.lg, 0),
              child: Row(
                children: [
                  Icon(Icons.hourglass_top_rounded,
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
                  padding:
                      const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
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
      ),
    );
  }
}

class _AuthorRow extends ConsumerWidget {
  const _AuthorRow({required this.post});

  final Post post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
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
                onTap: () => context.push(AppRoutes.lawyer(a.username)),
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
                            '@${a.username} · ${SocialFormat.ago(t, f, post.createdAt)}',
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
          AppIconButton(
            icon: const Icon(Icons.more_horiz_rounded),
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
      child: Icon(Icons.verified_rounded, size: size, color: colors.info),
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

/// A text-only post: the text on a soft gold-tinted panel with a large
/// serif quote mark (§2.4 "текстовые карточки").
class _TextPanel extends StatelessWidget {
  const _TextPanel({required this.body});

  final String body;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg, AppSpacing.md, AppSpacing.lg, AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.goldTint,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border(left: BorderSide(color: colors.gold, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ExcludeSemantics(
            child: Text(
              '“',
              style: type.titleLarge.copyWith(
                color: colors.gold,
                height: 0.8,
                fontSize: type.titleLarge.fontSize! * 1.6,
              ),
            ),
          ),
          PostBodyText(body: body, large: true),
        ],
      ),
    );
  }
}

/// Post text: collapsed to 3 lines with "ещё" (§2.4), #tags open the tag
/// page, @mentions are highlighted.
class PostBodyText extends ConsumerStatefulWidget {
  const PostBodyText({
    required this.body,
    this.expanded = false,
    this.large = false,
    super.key,
  });

  final String body;
  final bool expanded;
  final bool large;

  @override
  ConsumerState<PostBodyText> createState() => _PostBodyTextState();
}

class _PostBodyTextState extends ConsumerState<PostBodyText> {
  static final _token = RegExp(r'([#@][\p{L}\p{N}_]+)', unicode: true);
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
        spans.add(TextSpan(
          text: token,
          style: TextStyle(color: colors.text, fontWeight: FontWeight.w600),
        ));
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
    final style = (widget.large ? type.body : type.bodySmall)
        .copyWith(color: colors.text, height: 1.45);
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
    super.key,
  });

  final List<PostMedia> media;
  final VoidCallback onDoubleTap;
  final String semanticLabel;

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
    return Semantics(
      label: widget.semanticLabel,
      child: AspectRatio(
        aspectRatio: media.first.aspectRatio,
        child: GestureDetector(
          onDoubleTap: _doubleTap,
          child: Stack(
            fit: StackFit.expand,
            children: [
              PageView.builder(
                itemCount: media.length,
                onPageChanged: (i) => _page.value = i,
                itemBuilder: (context, i) => CachedNetworkImage(
                  imageUrl: media[i].mediumUrl,
                  cacheKey: '${media[i].fileId}:1080',
                  fit: BoxFit.cover,
                  fadeInDuration: context.reduceMotion
                      ? Duration.zero
                      : AppMotion.stateChange,
                  placeholder: (_, __) =>
                      ColoredBox(color: colors.skeletonBase),
                  errorWidget: (_, __, ___) => ColoredBox(
                    color: colors.skeletonBase,
                    child: Icon(Icons.image_not_supported_outlined,
                        color: colors.textSecondary),
                  ),
                ),
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
        ),
      ),
    );
  }
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
              child: Icon(
                Icons.favorite_rounded,
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
  const _ActionsBar({required this.post, required this.run});

  final Post post;
  final Future<void> Function(Future<Object?> Function()) run;

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
            activeIcon: Icons.favorite_rounded,
            icon: Icons.favorite_border_rounded,
            activeColor: colors.danger,
            label: t.t(post.likedByMe ? 'post.unlike' : 'post.like'),
            onTap: () => run(() => actions.toggleLike(post)),
          ),
          BounceIcon(
            active: false,
            activeIcon: Icons.mode_comment_outlined,
            icon: Icons.mode_comment_outlined,
            label: t.t('post.comments'),
            onTap: () => context.push(SocialRoutes.post(post.id)),
          ),
          BounceIcon(
            active: false,
            activeIcon: Icons.send_outlined,
            icon: Icons.send_outlined,
            label: t.t('post.share'),
            onTap: () => sharePost(context, ref, post),
          ),
          const Spacer(),
          BounceIcon(
            active: post.savedByMe,
            activeIcon: Icons.bookmark_rounded,
            icon: Icons.bookmark_border_rounded,
            activeColor: colors.gold,
            label: t.t(post.savedByMe ? 'post.unsave' : 'post.save'),
            onTap: () => run(() => actions.toggleSave(post)),
          ),
        ],
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
                  child: Icon(
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
        Icon(Icons.info_outline_rounded,
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
