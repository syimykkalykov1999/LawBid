import 'dart:async';
import 'dart:io' show File;
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show RenderRepaintBoundary;
import 'package:flutter/semantics.dart' show CustomSemanticsAction;
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/media/video_frames.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/social/application/social_providers.dart'
    show postProvider;
import 'package:lawbid/features/social/domain/social_models.dart' show Post;
import 'package:lawbid/features/stories/application/stories_providers.dart';
import 'package:lawbid/features/stories/application/story_publish_job.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/features/stories/domain/story_snap.dart';
import 'package:lawbid/features/stories/presentation/story_backgrounds.dart';
import 'package:lawbid/features/stories/presentation/story_camera_view.dart';
import 'package:lawbid/features/stories/presentation/story_emoji_picker.dart';
import 'package:lawbid/features/stories/presentation/story_frame.dart';
import 'package:lawbid/features/stories/presentation/story_guides.dart';
import 'package:lawbid/features/stories/presentation/story_navigation.dart';
import 'package:lawbid/features/stories/presentation/story_post_sticker.dart';
import 'package:lawbid/features/stories/presentation/story_publish_sheet.dart';
import 'package:video_player/video_player.dart';

/// The longest video the server takes as a source (its trim keeps 15 s).
const int _kSourceMaxSec = 600;

// Owner 2026-10-21 (Instagram «Добавить в историю»): `post` — a post as a
// sticker on a gradient.
enum _Mode { pick, photo, video, text, post }

class _Placed {
  _Placed(this.id, this.overlay, {this.isPost = false}) : raw = overlay;

  final int id;

  /// What is drawn (snapped to the guides).
  StoryOverlay overlay;

  /// Owner 2026-10-21: where the finger put it — snapping never moves the
  /// raw values, so a sticker leaves a guide as soon as it is dragged on.
  StoryOverlay raw;

  /// The post sticker (one at most; baked into the picture on Share).
  final bool isPost;
}

/// Owner 2026-10-20: a new story — a photo (gallery / camera), a video up to
/// 15 s (gallery / camera; a longer one: pick the part), or a text card —
/// with emoji stickers, a caption and an audience. "Share" hands everything
/// to the publish job, so the screen can be left at any time.
class StoryCreatorScreen extends ConsumerStatefulWidget {
  const StoryCreatorScreen({this.postId, super.key});

  /// Owner 2026-10-21 (Instagram «Добавить в историю»): open with this post
  /// as a sticker (`/stories/new?post=<id>`).
  final String? postId;

  @override
  ConsumerState<StoryCreatorScreen> createState() => _StoryCreatorScreenState();
}

class _StoryCreatorScreenState extends ConsumerState<StoryCreatorScreen> {
  _Mode _mode = _Mode.pick;
  Uint8List? _photo;
  String? _photoName;
  XFile? _video;
  VideoPlayerController? _player;
  Uint8List? _videoStill;
  int _videoMs = 0;
  ({int width, int height}) _videoSize = (width: 0, height: 0);
  int _trimStartMs = 0;
  String _background = kStoryBackgrounds.first;
  StoryAudience? _audience;
  final List<_Placed> _stickers = [];
  int _nextId = 1;
  bool _dragging = false;
  bool _overTrash = false;
  bool _picking = false;
  bool _left = false;

  /// Owner 2026-10-21: the guides the dragged sticker sits on, and where.
  Set<StoryGuide> _guides = const {};
  Offset _guideAt = Offset.zero;
  bool _draggingPost = false;
  final _captureKey = GlobalKey();
  final _postKey = GlobalKey();
  bool _sharing = false;

  final _text = TextEditingController();
  final _caption = TextEditingController();
  final _textFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    if (widget.postId != null) {
      _mode = _Mode.post;
      _stickers.add(
        _Placed(
          _nextId++,
          const StoryOverlay(emoji: '', x: 0.5, y: 0.5),
          isPost: true,
        ),
      );
    }
  }

  @override
  void dispose() {
    _left = true;
    _player?.removeListener(_loop);
    unawaited(_player?.dispose());
    _text.dispose();
    _caption.dispose();
    _textFocus.dispose();
    super.dispose();
  }

  int get _maxSec => ref.read(storyMaxVideoSecProvider);

  bool get _dirty =>
      _mode != _Mode.pick &&
      (_mode == _Mode.post ||
          _photo != null ||
          _video != null ||
          _text.text.trim().isNotEmpty ||
          _stickers.isNotEmpty);

  bool get _ready => switch (_mode) {
        _Mode.pick => false,
        _Mode.photo => _photo != null,
        _Mode.video => _video != null && _videoMs > 0,
        _Mode.text => _text.text.trim().isNotEmpty,
        _Mode.post => !_sharing && _post != null,
      };

  /// The shared post once loaded (post mode only).
  Post? get _post => widget.postId == null
      ? null
      : ref.read(postProvider(widget.postId!)).value;

  /// Emoji stickers only (the post sticker is not one of the 10).
  Iterable<_Placed> get _emoji => _stickers.where((s) => !s.isPost);

  // ── picking ────────────────────────────────────────────────────────

  Future<void> _pickPhoto(ImageSource source) async {
    if (_picking) return;
    final t = ref.read(translatorProvider);
    setState(() => _picking = true);
    try {
      final x = await ImagePicker().pickImage(
        source: source,
        maxWidth: 2160,
        maxHeight: 2160,
        imageQuality: 90,
      );
      if (x == null || !mounted) return;
      await _acceptPhoto(x);
    } on Object {
      if (mounted) showAppSnackBar(context, t.t('story.create.pickFailed'));
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  Future<void> _acceptPhoto(XFile x) async {
    final t = ref.read(translatorProvider);
    try {
      final bytes = await x.readAsBytes();
      if (!mounted) return;
      await _dropVideo();
      setState(() {
        _photo = bytes;
        _photoName = x.name;
        _mode = _Mode.photo;
      });
    } on Object {
      if (mounted) showAppSnackBar(context, t.t('story.create.pickFailed'));
    }
  }

  static const _videoExt = {'mp4', 'mov', 'm4v', 'webm', '3gp', 'mkv', 'avi'};

  /// The gallery button: one picker for photos and videos.
  Future<void> _pickGallery() async {
    if (_picking) return;
    final t = ref.read(translatorProvider);
    setState(() => _picking = true);
    try {
      final x = await ImagePicker().pickMedia(
        maxWidth: 2160,
        maxHeight: 2160,
        imageQuality: 90,
      );
      if (x == null || !mounted) return;
      final ext = x.name.split('.').last.toLowerCase();
      final video = (x.mimeType?.startsWith('video/') ?? false) ||
          _videoExt.contains(ext);
      if (video) {
        await _acceptVideo(x);
      } else {
        await _acceptPhoto(x);
      }
    } on Object {
      if (mounted) showAppSnackBar(context, t.t('story.create.pickFailed'));
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  Future<void> _pickVideo(ImageSource source) async {
    if (_picking) return;
    final t = ref.read(translatorProvider);
    setState(() => _picking = true);
    try {
      final x = await ImagePicker().pickVideo(
        source: source,
        maxDuration:
            source == ImageSource.camera ? Duration(seconds: _maxSec) : null,
      );
      if (x == null || !mounted) return;
      await _acceptVideo(x);
    } on Object {
      if (mounted) showAppSnackBar(context, t.t('story.create.pickFailed'));
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  Future<void> _acceptVideo(XFile x) async {
    final t = ref.read(translatorProvider);
    try {
      final info = await probeVideo(x);
      if (!mounted) return;
      if (info == null) {
        showAppSnackBar(context, t.t('reels.badFile'));
        return;
      }
      if ((info.totalMs / 1000).ceil() > _kSourceMaxSec) {
        showAppSnackBar(
          context,
          t.t('reels.tooLong', {'max': '$_kSourceMaxSec'}),
        );
        return;
      }
      await _dropVideo();
      setState(() {
        _video = x;
        _videoMs = info.totalMs;
        _videoSize = (
          width: info.size.width.round(),
          height: info.size.height.round(),
        );
        _trimStartMs = 0;
        _photo = null;
        _mode = _Mode.video;
      });
      unawaited(_openPlayer(x));
      unawaited(_loadStill(x));
    } on Object {
      if (mounted) showAppSnackBar(context, t.t('story.create.pickFailed'));
    }
  }

  Future<void> _dropVideo() async {
    final p = _player;
    _player = null;
    _video = null;
    _videoStill = null;
    p?.removeListener(_loop);
    await p?.dispose();
  }

  Future<void> _loadStill(XFile file) async {
    final bytes = await videoFrame(file, 0, quality: 60);
    if (mounted && identical(_video, file) && bytes != null) {
      setState(() => _videoStill = bytes);
    }
  }

  Future<void> _openPlayer(XFile file) async {
    final c = kIsWeb
        ? VideoPlayerController.networkUrl(Uri.parse(file.path))
        : VideoPlayerController.file(File(file.path));
    try {
      await (kIsWeb
          ? c.initialize().timeout(const Duration(seconds: 10))
          : c.initialize());
      await c.setVolume(0);
    } on Object {
      await c.dispose();
      return;
    }
    if (!mounted || !identical(_video, file)) {
      await c.dispose();
      return;
    }
    c.addListener(_loop);
    setState(() => _player = c);
    await c.seekTo(Duration(milliseconds: _trimStartMs));
    await c.play();
  }

  /// The preview plays the chosen part over and over.
  void _loop() {
    final c = _player;
    if (c == null || _left) return;
    final end =
        _trimStartMs + math.min(_maxSec * 1000, _videoMs - _trimStartMs);
    if (c.value.position.inMilliseconds >= end || c.value.isCompleted) {
      unawaited(c.seekTo(Duration(milliseconds: _trimStartMs)));
      unawaited(c.play());
    }
  }

  void _setStart(double ms) {
    setState(() => _trimStartMs = ms.round());
    unawaited(_player?.seekTo(Duration(milliseconds: _trimStartMs)));
  }

  // ── stickers ───────────────────────────────────────────────────────

  Future<void> _addSticker() async {
    final t = ref.read(translatorProvider);
    if (_emoji.length >= kStoryOverlaysMax) {
      showAppSnackBar(
        context,
        t.t('story.emoji.limit', {'count': '$kStoryOverlaysMax'}),
      );
      return;
    }
    _textFocus.unfocus();
    final emoji = await showStoryEmojiPicker(context, ref);
    if (emoji == null || !mounted) return;
    final n = _emoji.length;
    setState(() {
      _stickers.add(
        _Placed(
          _nextId++,
          StoryOverlay(
            emoji: emoji,
            x: 0.5 + (n % 3 - 1) * 0.12,
            y: 0.5 + (n % 4 - 1.5) * 0.08,
            scale: 1.6,
          ),
        ),
      );
    });
  }

  /// Owner 2026-10-21 (Instagram): the finger moves the raw values; what
  /// is drawn snaps to the centre / safe edges / a straight angle, with a
  /// tick of the phone when a new guide lights up.
  void _moveSticker(
    int id,
    StoryOverlay Function(StoryOverlay o) f,
    Size frame,
  ) {
    final s = _stickers.firstWhere((e) => e.id == id);
    final raw = f(s.raw);
    final snapped = snapStoryTransform(
      x: raw.x,
      y: raw.y,
      rotation: raw.rotation,
      frame: frame,
      half: _halfOf(s, raw, frame),
    );
    if (snapped.guides.difference(_guides).isNotEmpty) {
      unawaited(AppHaptics.selection());
    }
    setState(() {
      s
        ..raw = raw
        ..overlay = raw.copyWith(
          x: snapped.x,
          y: snapped.y,
          rotation: snapped.rotation,
        );
      _guides = snapped.guides;
      _guideAt = Offset(snapped.x * frame.width, snapped.y * frame.height);
    });
  }

  /// Half the sticker's size on screen (px), for the edge guides.
  Size _halfOf(_Placed s, StoryOverlay o, Size frame) {
    if (!s.isPost) {
      final side = frame.width * kStoryStickerBase * o.scale;
      return Size(side / 2, side / 2);
    }
    final box = _postKey.currentContext?.findRenderObject();
    final size = box is RenderBox && box.hasSize
        ? box.size
        : Size(frame.width * kStoryPostStickerWidth, 0);
    return Size(size.width * o.scale / 2, size.height * o.scale / 2);
  }

  void _raise(int id) {
    final i = _stickers.indexWhere((e) => e.id == id);
    if (i < 0 || i == _stickers.length - 1) return;
    setState(() => _stickers.add(_stickers.removeAt(i)));
  }

  // ── audience / publish ─────────────────────────────────────────────

  StoryAudience get _effectiveAudience =>
      _audience ??
      ref.read(storySettingsProvider).value?.audience ??
      StoryAudience.all;

  Future<void> _pickAudience() async {
    final t = ref.read(translatorProvider);
    final current = _effectiveAudience;
    final picked = await showAppBottomSheet<StoryAudience>(
      context: context,
      builder: (sheet) {
        final type = Theme.of(sheet).extension<AppTypographyTokens>()!;
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                ),
                child:
                    Text(t.t('story.audience.title'), style: type.titleMedium),
              ),
              for (final a in StoryAudience.values)
                AppListRow(
                  label: storyAudienceLabel(t, a),
                  selected: a == current,
                  showChevron: false,
                  onTap: () => Navigator.of(sheet).pop(a),
                ),
              const SizedBox(height: AppSpacing.md),
            ],
          ),
        );
      },
    );
    if (picked != null && mounted) setState(() => _audience = picked);
  }

  /// Owner 2026-10-21: the gradient with the post sticker as one picture
  /// (1080 px wide); emoji stickers and the caption stay live overlays.
  Future<Uint8List?> _capturePost() async {
    final box = _captureKey.currentContext?.findRenderObject();
    if (box is! RenderRepaintBoundary || !box.hasSize) return null;
    final image = await box.toImage(pixelRatio: 1080 / box.size.width);
    try {
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      return data?.buffer.asUint8List();
    } finally {
      image.dispose();
    }
  }

  Future<void> _share() async {
    if (!_ready) return;
    Uint8List? baked;
    if (_mode == _Mode.post) {
      final t = ref.read(translatorProvider);
      setState(() => _sharing = true);
      try {
        baked = await _capturePost();
      } on Object {
        baked = null;
      }
      if (!mounted) return;
      setState(() => _sharing = false);
      if (baked == null) {
        showAppSnackBar(context, t.t('story.post.failed'));
        return;
      }
    }
    final draft = StoryDraft(
      kind: switch (_mode) {
        _Mode.photo || _Mode.post => StoryKind.photo,
        _Mode.video => StoryKind.video,
        _ => StoryKind.text,
      },
      audience: _effectiveAudience,
      photo: baked ?? _photo,
      photoName: baked != null ? 'post-${widget.postId}.png' : _photoName,
      video: _video,
      videoDurationMs: _videoMs,
      videoSize: _videoSize.width > 0 ? _videoSize : null,
      trimStartMs: _trimStartMs,
      text: _mode == _Mode.text ? _text.text.trim() : _caption.text.trim(),
      background: _background,
      overlays: [for (final s in _emoji) s.overlay],
    );
    _textFocus.unfocus();
    FocusManager.instance.primaryFocus?.unfocus();
    ref.read(storyPublishJobProvider.notifier).start(draft).ignore();
  }

  /// Closes the screen for good (the discard question was answered).
  ///
  /// Owner 2026-10-20: Back never leaves the app. When the creator is the
  /// only page (opened by a link, or the stack was rebuilt) it goes to the
  /// feed instead of popping the last route.
  void _leave() {
    final nav = Navigator.of(context);
    if (nav.canPop()) {
      nav.pop();
    } else {
      GoRouter.maybeOf(context)?.go(AppRoutes.feed);
    }
  }

  Future<void> _confirmLeave() async {
    final t = ref.read(translatorProvider);
    final discard = await showDialog<bool>(
      context: context,
      builder: (dialog) => AppAlertDialog(
        title: Text(t.t('story.discard.title')),
        content: Text(t.t('story.discard.body')),
        actions: [
          AppButton(
            label: t.t('story.discard.confirm'),
            variant: AppButtonVariant.danger,
            onPressed: () => Navigator.of(dialog).pop(true),
          ),
          AppButton(
            label: t.t('story.discard.keep'),
            variant: AppButtonVariant.secondary,
            onPressed: () => Navigator.of(dialog).pop(false),
          ),
        ],
      ),
    );
    if ((discard ?? false) && mounted) _leave();
  }

  // ── build ──────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final job = ref.watch(storyPublishJobProvider);
    final postId = widget.postId;
    if (postId != null) {
      ref
        ..watch(postProvider(postId))
        // The post's picture is ready before it is baked into the story.
        ..listen(postProvider(postId), (_, next) {
          final post = next.value;
          final url = post == null ? null : storyPostImageUrl(post);
          if (url != null && context.mounted) {
            unawaited(
              precacheImage(appNetworkImage(url, 1080), context)
                  .catchError((Object _) {}),
            );
          }
          if (next.hasError && !next.isLoading && context.mounted) {
            showAppSnackBar(context, t.t('story.post.failed'));
          }
        });
    }
    ref
      ..watch(storySettingsProvider)
      ..listen(storyPublishJobProvider, (prev, next) {
        if (next.phase == StoryPublishPhase.done && context.mounted) {
          _leave();
        } else if (next.phase == StoryPublishPhase.failed &&
            prev?.phase != StoryPublishPhase.failed) {
          showAppSnackBar(context, errorText(t, next.error ?? Object()));
          ref.read(storyPublishJobProvider.notifier).dismiss();
        }
      });
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return PopScope(
      canPop: (!_dirty || job.busy) && Navigator.of(context).canPop(),
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (_dirty && !job.busy) {
          unawaited(_confirmLeave());
        } else {
          _leave();
        }
      },
      child: Scaffold(
        backgroundColor: colors.bg,
        appBar: AppTopBar(
          leading: AppBackButton(
            semanticLabel: t.t('story.close'),
            onPressed: () {
              if (_dirty && !job.busy) {
                unawaited(_confirmLeave());
              } else {
                _leave();
              }
            },
          ),
          title: Text(t.t('story.create.title')),
          actions: [
            AppIconButton(
              icon: const Icon(AppIcons.settingsOutlined),
              semanticLabel: t.t('story.menu.settings'),
              onPressed: () => openStorySettings(context),
            ),
          ],
        ),
        body: SafeArea(
          top: false,
          child: Stack(
            children: [
              if (_mode == _Mode.pick) _pickView(t) else _editView(t),
              if (job.busy) _publishOverlay(context, t),
            ],
          ),
        ),
      ),
    );
  }

  Widget _publishOverlay(BuildContext context, Translator t) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Positioned.fill(
      child: ColoredBox(
        color: Colors.black.withValues(alpha: 0.6),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.screenSide),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: colors.sheet,
                borderRadius: BorderRadius.circular(AppRadii.card),
              ),
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.xl),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const StoryPublishPanel(),
                    const SizedBox(height: AppSpacing.sm),
                    AppButton(
                      label: t.t('story.publish.background'),
                      variant: AppButtonVariant.secondary,
                      onPressed: _leave,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _pickView(Translator t) => StoryCameraView(
        maxVideoSec: _maxSec,
        enabled: !_picking,
        galleryLabel: t.t('story.create.photo'),
        shutterLabel: t.t('story.create.camera'),
        textLabel: t.t('story.create.text'),
        flipLabel: t.t('story.create.camera'),
        onPhoto: (x) => unawaited(_acceptPhoto(x)),
        onVideo: (x) => unawaited(_acceptVideo(x)),
        onGallery: () => unawaited(_pickGallery()),
        onText: () => setState(() => _mode = _Mode.text),
        onSystemPhoto: () => unawaited(_pickPhoto(ImageSource.camera)),
        onSystemVideo: () => unawaited(_pickVideo(ImageSource.camera)),
      );

  Widget _editView(Translator t) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final audience = _effectiveAudience;
    final trimmable = _mode == _Mode.video && _videoMs > _maxSec * 1000;
    return Column(
      children: [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
            child: LayoutBuilder(
              builder: (context, c) {
                final size = storyFrameSize(c.biggest);
                return Center(
                  child: SizedBox(
                    width: size.width,
                    height: size.height,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadii.card),
                      child: _canvas(t, size),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            0,
            AppSpacing.screenSide,
            AppSpacing.sm,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_mode == _Mode.text || _mode == _Mode.post) _backgrounds(t),
              if (_mode != _Mode.text)
                AppTextField(
                  controller: _caption,
                  // A tap on Share / the audience chip must not first close
                  // the keyboard: the panel moved down under the finger and
                  // the tap landed on the neighbouring chip.
                  onTapOutside: (_) {},
                  hintText: t.t('story.create.caption'),
                  semanticLabel: t.t('story.create.caption'),
                  maxLength: kStoryTextMax,
                  onChanged: (_) => setState(() {}),
                ),
              if (trimmable) ...[
                Text(
                  t.t('story.video.hint', {'sec': '$_maxSec'}),
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
                Slider(
                  value: _trimStartMs.toDouble(),
                  max: (_videoMs - _maxSec * 1000).toDouble(),
                  onChanged: _setStart,
                ),
              ],
              const SizedBox(height: AppSpacing.xs),
              Row(
                children: [
                  AppIconButton(
                    key: const ValueKey('story-sticker-add'),
                    icon: const Icon(AppIcons.stickerOutlined),
                    semanticLabel: t.t('story.emoji.add'),
                    onPressed: _addSticker,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: _AudienceChip(
                        label: storyAudienceLabel(t, audience),
                        semantic: t.t('story.audience.title'),
                        onTap: _pickAudience,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              AppButton(
                key: const ValueKey('story-share'),
                label: t.t('story.create.share'),
                icon: AppIcons.sendRounded,
                isEnabled: _ready,
                isLoading: _sharing,
                onPressed: () => unawaited(_share()),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _backgrounds(Translator t) => SizedBox(
        height: AppSizes.hitTarget,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: kStoryBackgrounds.length,
          separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.sm),
          itemBuilder: (context, i) {
            final key = kStoryBackgrounds[i];
            final selected = key == _background;
            final colors = Theme.of(context).extension<AppColorTokens>()!;
            return AppTapTarget(
              child: Semantics(
                button: true,
                selected: selected,
                label: t.t('story.create.background'),
                excludeSemantics: true,
                child: GestureDetector(
                  key: ValueKey('story-bg-$key'),
                  behavior: HitTestBehavior.opaque,
                  onTap: () => setState(() => _background = key),
                  child: Container(
                    width: AppSizes.touchTarget - 8,
                    height: AppSizes.touchTarget - 8,
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: storyBackgroundGradient(key),
                      border: Border.all(
                        color: selected ? colors.gold : colors.border,
                        width: selected ? 3 : 1,
                      ),
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      );

  // ── canvas ─────────────────────────────────────────────────────────

  Widget _canvas(Translator t, Size size) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final caption = _caption.text.trim();
    final post = _post;
    final postSticker = _stickers.where((s) => s.isPost).firstOrNull;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (_mode == _Mode.post)
          // Owner 2026-10-21: what Share bakes into the picture — the
          // gradient and the post sticker (emoji and caption stay live).
          RepaintBoundary(
            key: _captureKey,
            child: Stack(
              fit: StackFit.expand,
              children: [
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: storyBackgroundGradient(_background),
                  ),
                ),
                if (postSticker != null)
                  _EditableSticker(
                    key: ValueKey('story-sticker-${postSticker.id}'),
                    frame: size,
                    placed: postSticker,
                    removeLabel: t.t('story.emoji.remove'),
                    onStart: () => setState(() {
                      _dragging = true;
                      _draggingPost = true;
                    }),
                    onChange: (f) => _moveSticker(postSticker.id, f, size),
                    onEnd: () => setState(() {
                      _dragging = false;
                      _draggingPost = false;
                      _guides = const {};
                    }),
                    onRemove: null,
                    child: post == null
                        ? SizedBox(
                            width: size.width * kStoryPostStickerWidth,
                            height: size.width * kStoryPostStickerWidth,
                            child: const Center(
                              child: CircularProgressIndicator(),
                            ),
                          )
                        : KeyedSubtree(
                            key: _postKey,
                            child: StoryPostSticker(
                              post: post,
                              frameWidth: size.width,
                            ),
                          ),
                  ),
              ],
            ),
          )
        else
          switch (_mode) {
            _Mode.photo => _photo == null
                ? const SizedBox.shrink()
                : StoryPhotoLayer(image: MemoryImage(_photo!)),
            _Mode.video => _videoLayer(),
            _ => DecoratedBox(
                decoration: BoxDecoration(
                  gradient: storyBackgroundGradient(_background),
                ),
                child: Center(
                  child: Padding(
                    padding: EdgeInsets.all(size.width * 0.09),
                    child: ListenableBuilder(
                      listenable: _text,
                      builder: (context, _) {
                        final style = storyTextStyle(
                          type,
                          size.width,
                          _text.text.characters.length,
                        );
                        return TextField(
                          key: const ValueKey('story-text-field'),
                          controller: _text,
                          focusNode: _textFocus,
                          autofocus: true,
                          maxLines: null,
                          textAlign: TextAlign.center,
                          textCapitalization: TextCapitalization.sentences,
                          keyboardType: TextInputType.multiline,
                          inputFormatters: [
                            LengthLimitingTextInputFormatter(kStoryTextMax),
                          ],
                          style: style,
                          cursorColor: Colors.white,
                          decoration: InputDecoration(
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                            filled: false,
                            isCollapsed: true,
                            hintText: t.t('story.create.text.hint'),
                            hintStyle: style.copyWith(
                              color: Colors.white.withValues(alpha: 0.6),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ),
          },
        if (_mode != _Mode.text && caption.isNotEmpty)
          IgnorePointer(
            child: StoryCaption(text: caption, frameWidth: size.width),
          ),
        for (final s in _emoji)
          _EditableSticker(
            key: ValueKey('story-sticker-${s.id}'),
            frame: size,
            placed: s,
            removeLabel: t.t('story.emoji.remove'),
            onStart: () {
              _raise(s.id);
              setState(() => _dragging = true);
            },
            onChange: (f) {
              _moveSticker(s.id, f, size);
              final over = s.raw.y > 0.88;
              if (over != _overTrash) setState(() => _overTrash = over);
            },
            onEnd: () {
              final remove = s.raw.y > 0.88;
              setState(() {
                _dragging = false;
                _overTrash = false;
                _guides = const {};
                if (remove) _stickers.removeWhere((e) => e.id == s.id);
              });
            },
            onRemove: () => setState(
              () => _stickers.removeWhere((e) => e.id == s.id),
            ),
          ),
        if (_guides.isNotEmpty)
          IgnorePointer(
            child: CustomPaint(
              key: const ValueKey('story-guides'),
              painter: StoryGuidesPainter(guides: _guides, at: _guideAt),
            ),
          ),
        if (_dragging && !_draggingPost)
          Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: EdgeInsets.only(bottom: size.height * 0.03),
              child: _TrashTarget(active: _overTrash),
            ),
          ),
      ],
    );
  }

  Widget _videoLayer() {
    final c = _player;
    return Stack(
      fit: StackFit.expand,
      children: [
        const ColoredBox(color: Colors.black),
        if (_videoStill != null && (c == null || !c.value.isInitialized))
          Image.memory(_videoStill!, fit: BoxFit.contain),
        if (c != null && c.value.isInitialized)
          FittedBox(
            child: SizedBox(
              width: c.value.size.width,
              height: c.value.size.height,
              child: VideoPlayer(c),
            ),
          ),
      ],
    );
  }
}

/// "Everyone" / "Followers" / "My contacts".
String storyAudienceLabel(Translator t, StoryAudience a) => switch (a) {
      StoryAudience.all => t.t('story.audience.all'),
      StoryAudience.followers => t.t('story.audience.followers'),
      StoryAudience.contacts => t.t('story.audience.contacts'),
    };

class _AudienceChip extends StatelessWidget {
  const _AudienceChip({
    required this.label,
    required this.semantic,
    required this.onTap,
  });

  final String label;
  final String semantic;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: '$semantic: $label',
      excludeSemantics: true,
      child: InkWell(
        key: const ValueKey('story-audience-chip'),
        borderRadius: BorderRadius.circular(AppRadii.pill),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppRadii.pill),
              border: Border.all(color: colors.border),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(AppIcons.groupsOutlined, size: AppSizes.iconSm),
                const SizedBox(width: AppSpacing.sm),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.bodySmall,
                  ),
                ),
                const SizedBox(width: AppSpacing.xs),
                const Icon(AppIcons.expandMoreRounded, size: AppSizes.iconSm),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TrashTarget extends StatelessWidget {
  const _TrashTarget({required this.active});

  final bool active;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return AnimatedContainer(
      duration: AppMotion.stateChange,
      width: active ? 56 : 44,
      height: active ? 56 : 44,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: active ? colors.danger : Colors.black.withValues(alpha: 0.5),
      ),
      child: Icon(
        AppIcons.deleteOutlineRounded,
        color: active ? colors.onDanger : Colors.white,
      ),
    );
  }
}

/// A sticker the author can drag, pinch and turn; dropped on the bin at the
/// bottom it is removed. Owner 2026-10-21: [child] (the post sticker) is
/// scaled and turned as a whole and has no bin ([onRemove] null).
class _EditableSticker extends StatefulWidget {
  const _EditableSticker({
    required this.frame,
    required this.placed,
    required this.removeLabel,
    required this.onStart,
    required this.onChange,
    required this.onEnd,
    required this.onRemove,
    this.child,
    super.key,
  });

  final Size frame;
  final _Placed placed;
  final String removeLabel;
  final VoidCallback onStart;
  final void Function(StoryOverlay Function(StoryOverlay)) onChange;
  final VoidCallback onEnd;
  final VoidCallback? onRemove;
  final Widget? child;

  @override
  State<_EditableSticker> createState() => _EditableStickerState();
}

class _EditableStickerState extends State<_EditableSticker> {
  double _baseScale = 1;
  double _baseRotation = 0;

  @override
  Widget build(BuildContext context) {
    final o = widget.placed.overlay;
    final child = widget.child;
    return StoryAnchored(
      frame: widget.frame,
      x: o.x,
      y: o.y,
      child: Semantics(
        label: child == null ? o.emoji : null,
        customSemanticsActions: widget.onRemove == null
            ? null
            : {
                CustomSemanticsAction(label: widget.removeLabel):
                    widget.onRemove!,
              },
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onScaleStart: (_) {
            // From the raw values: a snapped sticker is pulled off a guide
            // as soon as the finger moves on.
            _baseScale = widget.placed.raw.scale;
            _baseRotation = widget.placed.raw.rotation;
            widget.onStart();
          },
          onScaleUpdate: (d) => widget.onChange(
            (cur) => cur.copyWith(
              x: (cur.x + d.focalPointDelta.dx / widget.frame.width)
                  .clamp(0, 1),
              y: (cur.y + d.focalPointDelta.dy / widget.frame.height)
                  .clamp(0, 1),
              scale: (_baseScale * d.scale).clamp(0.3, 4),
              rotation: (_baseRotation + d.rotation).clamp(-7, 7),
            ),
          ),
          onScaleEnd: (_) => widget.onEnd(),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.sm),
            child: child == null
                ? StoryStickerView(
                    overlay: o,
                    frameWidth: widget.frame.width,
                  )
                : Transform.rotate(
                    angle: o.rotation,
                    child: Transform.scale(scale: o.scale, child: child),
                  ),
          ),
        ),
      ),
    );
  }
}
