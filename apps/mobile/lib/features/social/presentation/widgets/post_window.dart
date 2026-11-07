import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/session/guest_mode.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/reels/presentation/reels_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart'
    show commentThreadSlivers;
import 'package:lawbid/features/social/presentation/widgets/comment_widgets.dart';
import 'package:lawbid/features/social/presentation/widgets/comments_sheet.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_impression_tracker.dart';

/// Whether a post opens as a window here: a wide website window with the
/// switch `web_post_window` on. A phone never gets here.
bool postWindowOn(BuildContext context) =>
    isDesktopWindow(context) &&
    ProviderScope.containerOf(context, listen: false)
        .read(featureFlagsControllerProvider)
        .isEnabled('web_post_window');

/// The posts of a grid as a window over the page, the idea from Instagram:
/// the picture on the left, the text and comments on the right, arrows (and
/// the arrow keys) to the neighbours, Esc or a click outside to close.
Future<void> showPostWindow(
  BuildContext context, {
  required List<Post> posts,
  required int index,
}) =>
    showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
      transitionDuration: const Duration(milliseconds: 120),
      pageBuilder: (_, __, ___) => PostWindow(posts: posts, index: index),
    );

/// Space around the window for the arrows and the close button.
const double _kWindowMargin = 72;
const double _kSidePaneWidth = 400;
const double _kTextOnlyWidth = 560;
const double _kMaxHeight = 880;

class PostWindow extends ConsumerStatefulWidget {
  const PostWindow({required this.posts, required this.index, super.key});

  final List<Post> posts;
  final int index;

  @override
  ConsumerState<PostWindow> createState() => _PostWindowState();
}

class _PostWindowState extends ConsumerState<PostWindow> {
  late String _currentId = widget.posts[widget.index].id;

  void _close() => Navigator.of(context).pop();

  KeyEventResult _onKey(
    KeyEvent e,
    List<Post> posts,
    int at, {
    required bool rtl,
  }) {
    if (e is! KeyDownEvent) return KeyEventResult.ignored;
    final delta = switch (e.logicalKey) {
      LogicalKeyboardKey.arrowRight => rtl ? -1 : 1,
      LogicalKeyboardKey.arrowLeft => rtl ? 1 : -1,
      _ => 0,
    };
    final next = at + delta;
    if (delta == 0 || next < 0 || next >= posts.length) {
      return KeyEventResult.ignored;
    }
    setState(() => _currentId = posts[next].id);
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final deleted = ref.watch(deletedPostsProvider);
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final posts = [
      for (final p in widget.posts)
        if (!deleted.contains(p.id) || p.id == _currentId) p,
    ];
    final at = posts.indexWhere((p) => p.id == _currentId);
    if (at < 0 || deleted.contains(_currentId)) {
      // Deleted from its own menu: the window goes with it.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && Navigator.of(context).canPop()) _close();
      });
      return const SizedBox.shrink();
    }
    return Focus(
      autofocus: true,
      onKeyEvent: (_, e) => _onKey(e, posts, at, rtl: rtl),
      child: Stack(
        children: [
          Center(
            child: PostWindowBody(
              key: ValueKey(posts[at].id),
              post: posts[at],
            ),
          ),
          PositionedDirectional(
            top: AppSpacing.md,
            end: AppSpacing.md,
            child: _WindowButton(
              icon: AppIcons.closeRounded,
              label: t.t('common.close'),
              onTap: _close,
            ),
          ),
          if (at > 0)
            PositionedDirectional(
              start: AppSpacing.md,
              top: 0,
              bottom: 0,
              child: Center(
                child: _WindowButton(
                  key: const ValueKey('post-window-prev'),
                  icon: AppIcons.arrowBackRounded,
                  flip: true,
                  label: t.t('post.window.prev'),
                  onTap: () => setState(() => _currentId = posts[at - 1].id),
                ),
              ),
            ),
          if (at < posts.length - 1)
            PositionedDirectional(
              end: AppSpacing.md,
              top: 0,
              bottom: 0,
              child: Center(
                child: _WindowButton(
                  key: const ValueKey('post-window-next'),
                  icon: AppIcons.arrowForwardRounded,
                  flip: true,
                  label: t.t('post.window.next'),
                  onTap: () => setState(() => _currentId = posts[at + 1].id),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _WindowButton extends StatelessWidget {
  const _WindowButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.flip = false,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  /// A direction arrow turns over in a right-to-left language.
  final bool flip;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return Material(
      color: colors.surface,
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: IconButton(
        tooltip: label,
        onPressed: onTap,
        icon: Transform.flip(
          flipX: flip && rtl,
          child: AppIcon(icon, color: colors.text),
        ),
      ),
    );
  }
}

/// The window itself: as tall as the screen allows, the picture at its own
/// shape on the left, a fixed pane on the right.
class PostWindowBody extends ConsumerWidget {
  const PostWindowBody({required this.post, super.key});

  final Post post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final screen = MediaQuery.sizeOf(context);
    final video = post.video;
    final hasMedia = video != null || post.media.isNotEmpty;
    final ratio = video != null
        ? video.aspectRatio
        : post.media.isNotEmpty
            ? post.media.first.aspectRatio
            : 1.0;
    final freeW = screen.width - _kWindowMargin * 2;
    var h = math.min(screen.height - _kWindowMargin, _kMaxHeight);
    double mediaW = 0;
    if (hasMedia) {
      final shape = ratio.clamp(0.56, 1.91);
      mediaW = math.min(h * shape, freeW - _kSidePaneWidth);
      h = math.min(h, mediaW / shape);
    }
    final side =
        hasMedia ? _kSidePaneWidth : math.min<double>(_kTextOnlyWidth, freeW);
    final actions = ref.read(socialActionsProvider);
    return Material(
      color: colors.bg,
      borderRadius: BorderRadius.circular(AppRadii.card),
      clipBehavior: Clip.antiAlias,
      child: SizedBox(
        key: const ValueKey('post-window'),
        width: mediaW + side,
        height: h,
        child: Row(
          children: [
            if (video != null)
              SizedBox(
                width: mediaW,
                height: h,
                child: InlineReel(
                  post: post,
                  onOpen: () => ReelsScreen.open(context, from: post),
                ),
              )
            else if (post.media.isNotEmpty)
              SizedBox(
                width: mediaW,
                height: h,
                child: PostMediaCarousel(
                  media: post.media,
                  fill: true,
                  semanticLabel: t.t('post.media.label'),
                  onDoubleTap: () => actions.like(post),
                ),
              ),
            SizedBox(width: side, child: _SidePane(post: post)),
          ],
        ),
      ),
    );
  }
}

/// The post without its picture, the comments under it, the field below.
class _SidePane extends ConsumerStatefulWidget {
  const _SidePane({required this.post});

  final Post post;

  @override
  ConsumerState<_SidePane> createState() => _SidePaneState();
}

class _SidePaneState extends ConsumerState<_SidePane> {
  ReplyTarget? _replyTo;
  final _focus = FocusNode();

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  void _reply(ReplyTarget target) {
    setState(() => _replyTo = target);
    _focus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final p = widget.post;
    // Comments need an account: a guest sees the post only.
    final guest = ref.watch(isGuestProvider);
    final comments = guest ? null : ref.watch(commentsProvider(p.id));
    return PostCommentsInline(
      focus: _focus.requestFocus,
      child: Column(
        children: [
          Expanded(
            child: CustomScrollView(
              slivers: [
                SliverToBoxAdapter(
                  child: PostImpressionTracker(
                    post: p,
                    child: PostCard(
                      post: p,
                      inDetail: true,
                      mediaApart: true,
                      onReply: _focus.requestFocus,
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: Divider(height: 1, color: colors.border),
                ),
                if (comments != null)
                  ...commentThreadSlivers(
                    context,
                    ref,
                    p.id,
                    comments,
                    _reply,
                    threads: true,
                  ),
                const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.symmetric(
                      horizontal: AppSpacing.screenSide,
                    ),
                    child: PostDisclaimer(),
                  ),
                ),
              ],
            ),
          ),
          if (!guest)
            if (p.commentsEnabled)
              CommentComposer(
                postId: p.id,
                replyTo: _replyTo,
                focusNode: _focus,
                onClearReply: () => setState(() => _replyTo = null),
              )
            else
              Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Text(
                  t.t('post.comments.off'),
                  textAlign: TextAlign.center,
                  style: type.bodySmall.copyWith(color: colors.textSecondary),
                ),
              ),
        ],
      ),
    );
  }
}
