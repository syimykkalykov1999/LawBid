import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/media/playback_visibility.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/stories/application/stories_providers.dart';
import 'package:lawbid/features/stories/application/story_playback.dart';
import 'package:lawbid/features/stories/application/story_reply.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/features/stories/presentation/story_frame.dart';
import 'package:lawbid/features/stories/presentation/story_video.dart';
import 'package:lawbid/features/stories/presentation/story_viewer_sheets.dart';

/// The full-screen viewer of one person's live stories; when they end it
/// goes on to the next person in the tray who has something unseen.
class StoryViewerScreen extends ConsumerStatefulWidget {
  const StoryViewerScreen({required this.userId, super.key});

  final String userId;

  @override
  ConsumerState<StoryViewerScreen> createState() => _StoryViewerScreenState();
}

class _StoryViewerScreenState extends ConsumerState<StoryViewerScreen> {
  late String _userId = widget.userId;
  ProviderContainer? _container;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _container ??= ProviderScope.containerOf(context, listen: false);
  }

  @override
  void dispose() {
    // The rings behind this screen follow what was just watched.
    _container?.invalidate(storyTrayProvider);
    super.dispose();
  }

  void _close() {
    if (context.canPop()) {
      context.pop();
    } else {
      Navigator.of(context).maybePop();
    }
  }

  /// Another person's stories, [step] places along the tray.
  void _move(int step) {
    final tray = ref.read(storyTrayProvider).value ?? const <StoryTrayItem>[];
    final i = tray.indexWhere((e) => e.user.id == _userId);
    final from = i < 0 ? (step > 0 ? -1 : tray.length) : i;
    for (var j = from + step; j >= 0 && j < tray.length; j += step) {
      final item = tray[j];
      if (item.isMe || !item.hasStories) continue;
      if (step > 0 && !item.hasUnseen) continue;
      setState(() => _userId = item.user.id);
      return;
    }
    if (step > 0) _close();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final stories = ref.watch(userStoriesProvider(_userId));
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: stories.when(
          loading: () => _Plain(
            onClose: _close,
            t: t,
            child: const CircularProgressIndicator(color: Colors.white),
          ),
          error: (e, _) => _Plain(
            onClose: _close,
            t: t,
            child: AppErrorState(
              message: errorText(t, e),
              retryLabel: t.t('common.retry'),
              onRetry: () => ref.invalidate(userStoriesProvider(_userId)),
            ),
          ),
          data: (list) => list.isEmpty
              ? _Plain(
                  onClose: _close,
                  t: t,
                  child: AppEmptyState(
                    message: t.t('story.viewer.empty'),
                    icon: AppIcons.imageNotSupportedOutlined,
                  ),
                )
              : StoryPlaybackView(
                  key: ValueKey(_userId),
                  stories: list,
                  startIndex: _firstUnseen(list),
                  onClose: _close,
                  onFinished: () => _move(1),
                  onBeforeFirst: () => _move(-1),
                  onNextUser: () => _move(1),
                  onPreviousUser: () => _move(-1),
                  onDeleted: (_) {
                    ref
                      ..invalidate(userStoriesProvider(_userId))
                      ..invalidate(storyTrayProvider);
                  },
                ),
        ),
      ),
    );
  }

  int _firstUnseen(List<Story> list) {
    final i = list.indexWhere((s) => !s.viewedByMe);
    return i < 0 ? 0 : i;
  }
}

class _Plain extends StatelessWidget {
  const _Plain({required this.child, required this.onClose, required this.t});

  final Widget child;
  final VoidCallback onClose;
  final Translator t;

  @override
  Widget build(BuildContext context) => SafeArea(
        child: Stack(
          children: [
            Center(child: child),
            PositionedDirectional(
              top: AppSpacing.xs,
              end: AppSpacing.xs,
              child: StoryChromeButton(
                icon: AppIcons.closeRounded,
                label: t.t('story.close'),
                onTap: onClose,
              ),
            ),
          ],
        ),
      );
}

/// A white icon button over a story (44 dp, a label for screen readers).
class StoryChromeButton extends StatelessWidget {
  const StoryChromeButton({
    required this.icon,
    required this.label,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => AppTapTarget(
        child: Semantics(
          button: true,
          label: label,
          excludeSemantics: true,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onTap,
            child: SizedBox(
              width: AppSizes.touchTarget,
              height: AppSizes.touchTarget,
              child: Icon(icon, color: Colors.white, size: AppSizes.iconLg),
            ),
          ),
        ),
      );
}

/// Plays [stories] (one author's, oldest first): bars, header, content,
/// taps, hold, swipes, the reply field or the viewers button.
/// [readOnly] (the archive): nothing is marked seen, no reply, no menu.
class StoryPlaybackView extends ConsumerStatefulWidget {
  const StoryPlaybackView({
    required this.stories,
    required this.onClose,
    this.startIndex = 0,
    this.readOnly = false,
    this.onFinished,
    this.onBeforeFirst,
    this.onNextUser,
    this.onPreviousUser,
    this.onDeleted,
    super.key,
  });

  final List<Story> stories;
  final int startIndex;
  final bool readOnly;
  final VoidCallback onClose;
  final VoidCallback? onFinished;
  final VoidCallback? onBeforeFirst;
  final VoidCallback? onNextUser;
  final VoidCallback? onPreviousUser;
  final ValueChanged<Story>? onDeleted;

  @override
  ConsumerState<StoryPlaybackView> createState() => _StoryPlaybackViewState();
}

class _StoryPlaybackViewState extends ConsumerState<StoryPlaybackView>
    with SingleTickerProviderStateMixin, PlaybackVisibility {
  static const _touch = 'touch';
  static const _reply = 'reply';
  static const _visibility = 'visibility';

  late List<Story> _stories = List.of(widget.stories);
  late StoryPlayback _pb = _makePlayback(widget.startIndex);
  late final Ticker _ticker;
  Duration _last = Duration.zero;
  int _shownIndex = -1;
  bool _shownPaused = false;
  int _shownRestarts = 0;
  bool _shownTimed = true;
  bool _closed = false;

  final _replyController = TextEditingController();
  final _replyFocus = FocusNode();
  bool _sending = false;
  bool _sent = false;
  Timer? _sentTimer;

  StoryPlayback _makePlayback(int start) => StoryPlayback(
        stories: _stories,
        startIndex: start,
        onShown: _onShown,
        onFinished: _finish,
        onBeforeFirst: () => widget.onBeforeFirst != null
            ? widget.onBeforeFirst!()
            : _pb.previous(),
      )..addListener(_onChanged);

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_onTick)..start();
    _replyFocus.addListener(() {
      if (_replyFocus.hasFocus) {
        _pb.hold(_reply);
      } else {
        _pb.release(_reply);
      }
    });
  }

  @override
  void dispose() {
    _sentTimer?.cancel();
    _ticker.dispose();
    _pb
      ..removeListener(_onChanged)
      ..dispose();
    _replyController.dispose();
    _replyFocus.dispose();
    super.dispose();
  }

  /// The frame clock runs only while something is timed and playing — a
  /// held story, or a video paced by its player, does not wake the app.
  void _syncTicker() {
    final run = !_pb.paused && _pb.timed && !_pb.finished;
    if (run && !_ticker.isActive) {
      _last = Duration.zero;
      _ticker.start();
    } else if (!run && _ticker.isActive) {
      _ticker.stop();
    }
  }

  void _onTick(Duration elapsed) {
    // A ticker that was muted (a screen over this one) resumes with a big
    // jump: count at most a frame or two of it.
    final dt = elapsed - _last;
    _last = elapsed;
    _pb.advance(
      dt > const Duration(milliseconds: 100)
          ? const Duration(milliseconds: 16)
          : dt,
    );
  }

  @override
  void didChangePlaybackVisibility({required bool visible}) {
    if (visible) {
      _pb.release(_visibility);
    } else {
      _pb.hold(_visibility);
    }
  }

  void _onShown(Story s) {
    if (widget.readOnly || s.isMine) return;
    ref.read(storiesRepositoryProvider).markViewed(s.id).ignore();
  }

  void _finish() {
    if (_closed) return;
    final next = widget.onFinished;
    if (next == null) {
      _closed = true;
      widget.onClose();
    } else {
      next();
    }
  }

  /// The tree below depends on the story on screen, the pause and a
  /// restart — not on every tick of the bars.
  void _onChanged() {
    if (!mounted) return;
    _syncTicker();
    if (_pb.index != _shownIndex ||
        _pb.paused != _shownPaused ||
        _pb.restarts != _shownRestarts ||
        _pb.timed != _shownTimed) {
      setState(() {});
    }
  }

  // ── gestures ───────────────────────────────────────────────────────

  void _onTap(TapUpDetails d, double width) {
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final x = rtl ? width - d.localPosition.dx : d.localPosition.dx;
    if (x < width / 3) {
      _pb.previous();
    } else {
      _pb.next();
    }
  }

  void _onVerticalEnd(DragEndDetails d) {
    final v = d.velocity.pixelsPerSecond.dy;
    if (v > 400) {
      widget.onClose();
    } else if (v < -400 && _pb.current.isMine && !widget.readOnly) {
      unawaited(_openViewers());
    }
  }

  void _onHorizontalEnd(DragEndDetails d) {
    final v = d.velocity.pixelsPerSecond.dx;
    if (v.abs() < 500) return;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final towardsNext = rtl ? v > 0 : v < 0;
    final go = towardsNext ? widget.onNextUser : widget.onPreviousUser;
    go?.call();
  }

  // ── actions ────────────────────────────────────────────────────────

  Future<void> _openViewers() async {
    final story = _pb.current;
    final gone = await showStoryViewersSheet(context, ref, story);
    if (gone && mounted) _afterDelete(story);
  }

  Future<void> _openMenu() async {
    final story = _pb.current;
    final gone = await showStoryMenu(context, ref, story);
    if (gone && mounted) _afterDelete(story);
  }

  /// [story] was deleted: it drops out of the sequence, the rest plays on.
  void _afterDelete(Story story) {
    widget.onDeleted?.call(story);
    final at = _pb.index;
    final rest = [
      for (final s in _stories)
        if (s.id != story.id) s,
    ];
    if (rest.isEmpty) {
      widget.onClose();
      return;
    }
    _pb
      ..removeListener(_onChanged)
      ..dispose();
    setState(() {
      _stories = rest;
      _pb = _makePlayback(at.clamp(0, rest.length - 1));
    });
  }

  Future<void> _sendReply() async {
    final text = _replyController.text.trim();
    if (text.isEmpty || _sending) return;
    final t = ref.read(translatorProvider);
    final story = _pb.current;
    setState(() => _sending = true);
    try {
      await ref.read(storyReplySenderProvider)(story.author.id, text);
      if (!mounted) return;
      _replyController.clear();
      _replyFocus.unfocus();
      setState(() {
        _sending = false;
        _sent = true;
      });
      _sentTimer?.cancel();
      _sentTimer = Timer(const Duration(milliseconds: 1800), () {
        if (mounted) setState(() => _sent = false);
      });
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  // ── build ──────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    _shownIndex = _pb.index;
    _shownPaused = _pb.paused;
    _shownRestarts = _pb.restarts;
    _shownTimed = _pb.timed;
    _syncTicker();
    final t = ref.watch(translatorProvider);
    final story = _pb.current;
    final canReply = !widget.readOnly && !story.isMine && story.canReply;
    final showViewers = !widget.readOnly && story.isMine;
    return SafeArea(
      child: Column(
        children: [
          Expanded(
            child: LayoutBuilder(
              builder: (context, c) {
                final size = storyFrameSize(c.biggest);
                return Center(
                  child: SizedBox(
                    width: size.width,
                    height: size.height,
                    child: _frame(context, t, story, size),
                  ),
                );
              },
            ),
          ),
          if (canReply)
            _replyBar(t)
          else if (showViewers)
            _viewersBar(t, story),
        ],
      ),
    );
  }

  Widget _frame(BuildContext context, Translator t, Story story, Size size) {
    final video = story.video;
    final player = story.kind == StoryKind.video &&
            video != null &&
            video.ready &&
            !_pb.timed
        ? StoryVideoPlayer(
            key: ValueKey('story-video-${story.id}'),
            video: video,
            paused: _pb.paused,
            restart: _pb.restarts,
            onProgress: _pb.reportVideo,
            onEnded: _pb.completeCurrent,
            onFailed: _pb.videoFailed,
          )
        : null;
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadii.card),
      child: Stack(
        fit: StackFit.expand,
        children: [
          StoryFrame(key: ValueKey(story.id), story: story, video: player),
          Positioned.fill(
            child: GestureDetector(
              key: const ValueKey('story-gestures'),
              behavior: HitTestBehavior.opaque,
              onTapUp: (d) => _onTap(d, size.width),
              onLongPressStart: (_) => _pb.hold(_touch),
              onLongPressEnd: (_) => _pb.release(_touch),
              onLongPressCancel: () => _pb.release(_touch),
              onVerticalDragEnd: _onVerticalEnd,
              onHorizontalDragEnd: _onHorizontalEnd,
            ),
          ),
          _TopChrome(
            pb: _pb,
            story: story,
            count: _stories.length,
            readOnly: widget.readOnly,
            onClose: widget.onClose,
            onMenu: _openMenu,
          ),
        ],
      ),
    );
  }

  Widget _viewersBar(Translator t, Story story) {
    final formats = ref.watch(l10nFormatsProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final label = t.plural(
      'story.viewer.views',
      story.viewCount,
      {'count': formats.number(story.viewCount)},
    );
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        key: const ValueKey('story-viewers-button'),
        behavior: HitTestBehavior.opaque,
        onTap: _openViewers,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenSide,
                vertical: AppSpacing.sm,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    AppIcons.visibilityOutlined,
                    color: Colors.white,
                    size: AppSizes.iconMd,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(color: Colors.white),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _replyBar(Translator t) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final white = Colors.white.withValues(alpha: 0.7);
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadii.pill),
      borderSide: BorderSide(color: white),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenSide,
        vertical: AppSpacing.sm,
      ),
      child: _sent
          ? SizedBox(
              height: AppSizes.touchTarget,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(AppIcons.checkRounded, color: Colors.white),
                  const SizedBox(width: AppSpacing.sm),
                  Flexible(
                    child: Text(
                      t.t('story.viewer.reply.sent'),
                      style: type.body.copyWith(color: Colors.white),
                    ),
                  ),
                ],
              ),
            )
          : Row(
              children: [
                Expanded(
                  child: TextField(
                    key: const ValueKey('story-reply-field'),
                    controller: _replyController,
                    focusNode: _replyFocus,
                    enabled: !_sending,
                    minLines: 1,
                    maxLines: 3,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _sendReply(),
                    inputFormatters: [LengthLimitingTextInputFormatter(2000)],
                    style: type.body.copyWith(color: Colors.white),
                    cursorColor: Colors.white,
                    decoration: InputDecoration(
                      hintText: t.t('story.viewer.reply.hint'),
                      hintStyle: type.body.copyWith(color: white),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.lg,
                        vertical: AppSpacing.md,
                      ),
                      border: border,
                      enabledBorder: border,
                      focusedBorder: border.copyWith(
                        borderSide: const BorderSide(color: Colors.white),
                      ),
                      disabledBorder: border,
                    ),
                  ),
                ),
                ListenableBuilder(
                  listenable: _replyController,
                  builder: (context, _) => StoryChromeButton(
                    icon: AppIcons.sendRounded,
                    label: t.t('story.viewer.reply.send'),
                    onTap: _replyController.text.trim().isEmpty || _sending
                        ? () {}
                        : _sendReply,
                  ),
                ),
              ],
            ),
    );
  }
}

/// Progress bars, then the author line with the "⋯" and close buttons.
class _TopChrome extends ConsumerWidget {
  const _TopChrome({
    required this.pb,
    required this.story,
    required this.count,
    required this.readOnly,
    required this.onClose,
    required this.onMenu,
  });

  final StoryPlayback pb;
  final Story story;
  final int count;
  final bool readOnly;
  final VoidCallback onClose;
  final VoidCallback onMenu;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final url = story.author.avatarUrl;
    return Align(
      alignment: Alignment.topCenter,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Colors.black.withValues(alpha: 0.55),
              Colors.black.withValues(alpha: 0),
            ],
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.only(top: AppSpacing.sm),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                child: ListenableBuilder(
                  listenable: pb,
                  builder: (context, _) => Row(
                    key: const ValueKey('story-bars'),
                    children: [
                      for (var i = 0; i < count; i++) ...[
                        if (i > 0) const SizedBox(width: 3),
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(AppRadii.pill),
                            child: LinearProgressIndicator(
                              value: pb.barValue(i),
                              minHeight: 3,
                              color: Colors.white,
                              backgroundColor:
                                  Colors.white.withValues(alpha: 0.35),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsetsDirectional.only(
                  start: AppSpacing.sm,
                  end: AppSpacing.xs,
                ),
                child: Row(
                  children: [
                    AppAvatar(
                      size: 36,
                      initials: story.author.initials,
                      imageProvider: url == null
                          ? null
                          : appNetworkImage(url, decodeWidthFor(36)),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Row(
                        children: [
                          Flexible(
                            child: Text(
                              story.author.displayName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: type.body.copyWith(
                                color: Colors.white,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          if (story.author.verified) ...[
                            const SizedBox(width: AppSpacing.xs),
                            Icon(
                              AppIcons.verifiedRounded,
                              size: AppSizes.iconSm - 4,
                              color: colors.goldLight,
                            ),
                          ],
                          const SizedBox(width: AppSpacing.sm),
                          Text(
                            SocialFormat.ago(t, formats, story.createdAt),
                            maxLines: 1,
                            style: type.caption.copyWith(
                              color: Colors.white.withValues(alpha: 0.8),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (!readOnly)
                      StoryChromeButton(
                        icon: AppIcons.moreHorizRounded,
                        label: t.t('story.viewer.more'),
                        onTap: onMenu,
                      ),
                    StoryChromeButton(
                      icon: AppIcons.closeRounded,
                      label: t.t('story.close'),
                      onTap: onClose,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
