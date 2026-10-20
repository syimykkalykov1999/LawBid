import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart'
    show ImagePicker, ImageSource, XFile;
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/media/playback_visibility.dart';
import 'package:lawbid/core/media/video_frames.dart';
import 'package:lawbid/features/reels/domain/reel_cut.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:video_player/video_player.dart';

/// Owner 2026-10-15 (approved mockup A): the «Video» editor opened from the
/// post screen. A preview on top, then two tabs — «Trim» (a frame strip with
/// a gold frame and two handles, start / length / end) and «Cover» (a white
/// frame slid along the strip, and how it looks in the profile grid).
/// «Done» returns the edited [ReelCut]; the close button returns nothing.
/// What «Done» returns: the cut, and a cover picked from the gallery
/// (already uploaded as [coverFileId]) instead of a frame.
class VideoEdit {
  const VideoEdit(this.cut, {this.coverBytes, this.coverFileId});

  final ReelCut cut;
  final Uint8List? coverBytes;
  final String? coverFileId;
}

class VideoEditorScreen extends ConsumerStatefulWidget {
  const VideoEditorScreen({
    required this.file,
    required this.cut,
    required this.maxMs,
    this.initialTab = 0,
    this.coverBytes,
    this.coverFileId,
    super.key,
  });

  /// A gallery cover chosen earlier.
  final Uint8List? coverBytes;
  final String? coverFileId;

  final XFile file;
  final ReelCut cut;

  /// The longest part a reel plays (the admin's `video.max_duration_sec`).
  final int maxMs;

  /// 0 = Trim, 1 = Cover.
  final int initialTab;

  @override
  ConsumerState<VideoEditorScreen> createState() => _VideoEditorScreenState();
}

const _kStripFrames = 8;
const _kStripHeight = 56.0;
const _kHandleWidth = 14.0;
const _kCoverWidth = 30.0;

class _VideoEditorScreenState extends ConsumerState<VideoEditorScreen>
    with PlaybackVisibility {
  late ReelCut _cut = widget.cut;
  late int _tab = widget.initialTab;
  VideoPlayerController? _player;
  final _frames = List<Uint8List?>.filled(_kStripFrames, null);
  Uint8List? _coverFrame;
  Timer? _coverTimer;

  /// A cover from the gallery, and the state of its upload.
  late Uint8List? _custom = widget.coverBytes;
  late String? _customId = widget.coverFileId;
  bool _uploadingCover = false;

  @override
  void initState() {
    super.initState();
    unawaited(_openPlayer());
    unawaited(_loadFrames());
    _scheduleCoverFrame();
  }

  @override
  void dispose() {
    _coverTimer?.cancel();
    _player?.removeListener(_loopInCut);
    unawaited(_player?.dispose());
    super.dispose();
  }

  Future<void> _openPlayer() async {
    final c = kIsWeb
        ? VideoPlayerController.networkUrl(Uri.parse(widget.file.path))
        : VideoPlayerController.file(File(widget.file.path));
    try {
      // iOS Safari may never say a picked video can play: after 10 s the
      // editor works from the frames alone instead of waiting forever.
      await (kIsWeb
          ? c.initialize().timeout(const Duration(seconds: 10))
          : c.initialize());
      await c.setLooping(true);
      await c.setVolume(0);
    } on Object {
      await c.dispose();
      return;
    }
    if (!mounted) {
      await c.dispose();
      return;
    }
    c.addListener(_loopInCut);
    setState(() => _player = c);
    await _showTab();
  }

  /// Owner 2026-10-18: the preview stops while the app is in the
  /// background or a screen is over the editor, and plays on when back.
  @override
  void didChangePlaybackVisibility({required bool visible}) =>
      holdPlayback(_player, visible: visible);

  Future<void> _loadFrames() async {
    for (var i = 0; i < _kStripFrames; i++) {
      final ms = ((i + 0.5) / _kStripFrames * _cut.totalMs).round();
      final bytes = await videoFrame(widget.file, ms, quality: 30);
      if (!mounted) return;
      if (bytes != null) setState(() => _frames[i] = bytes);
    }
  }

  void _scheduleCoverFrame() {
    _coverTimer?.cancel();
    _coverTimer = Timer(const Duration(milliseconds: 250), () async {
      final bytes = await videoFrame(widget.file, _cut.coverMs, quality: 60);
      if (mounted && bytes != null) setState(() => _coverFrame = bytes);
    });
  }

  /// The preview plays only the chosen part, round and round.
  void _loopInCut() {
    final c = _player;
    if (c == null || _tab != 0 || !c.value.isPlaying) return;
    final pos = c.value.position.inMilliseconds;
    if (pos >= _cut.endMs || pos < _cut.startMs - 250) {
      unawaited(c.seekTo(Duration(milliseconds: _cut.startMs)));
    }
  }

  Future<void> _showTab() async {
    final c = _player;
    if (c == null) return;
    if (_tab == 0) {
      await c.seekTo(Duration(milliseconds: _cut.startMs));
      await playWhenVisible(c);
    } else {
      await c.pause();
      await c.seekTo(Duration(milliseconds: _cut.coverMs));
    }
  }

  void _setRange(int start, int end) {
    final startMoved = start != _cut.startMs;
    final next = _cut.withRange(start, end, widget.maxMs);
    setState(() => _cut = next);
    _scheduleCoverFrame();
    final c = _player;
    if (c == null) return;
    unawaited(
      c.seekTo(
        Duration(
          milliseconds: startMoved ? next.startMs : next.endMs - 300,
        ),
      ),
    );
    if (!c.value.isPlaying) unawaited(c.play());
  }

  void _setCover(int ms) {
    setState(() {
      _cut = _cut.withCover(ms);
      _custom = null;
      _customId = null;
    });
    _scheduleCoverFrame();
    final c = _player;
    if (c == null) return;
    unawaited(c.pause());
    unawaited(c.seekTo(Duration(milliseconds: _cut.coverMs)));
  }

  Future<void> _pickCover() async {
    final t = ref.read(translatorProvider);
    final x = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1440,
      maxHeight: 1440,
      imageQuality: 80,
    );
    if (x == null || !mounted) return;
    final bytes = await x.readAsBytes();
    if (!mounted) return;
    setState(() {
      _custom = bytes;
      _customId = null;
      _uploadingCover = true;
    });
    try {
      final id = await ref.read(socialActionsProvider).uploadPhoto(bytes);
      if (mounted && identical(_custom, bytes)) {
        setState(() => _customId = id);
      }
    } on Object {
      if (mounted) {
        setState(() => _custom = null);
        showAppSnackBar(context, t.t('reels.upload.failed'));
      }
    } finally {
      if (mounted) setState(() => _uploadingCover = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = _player;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppIconButton(
          icon: const AppIcon(AppIcons.closeRounded),
          semanticLabel: t.t('common.close'),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(t.t('video.edit.title')),
        actions: [
          TextButton(
            onPressed: _uploadingCover
                ? null
                : () => Navigator.of(context).pop(
                      VideoEdit(
                        _cut,
                        coverBytes: _customId == null ? null : _custom,
                        coverFileId: _customId,
                      ),
                    ),
            child: Text(
              t.t('video.edit.done'),
              style: type.body.copyWith(
                color: colors.goldDark,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          children: [
            Center(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AppRadii.card),
                child: SizedBox(
                  width: 198,
                  height: 352,
                  child: c == null
                      ? ColoredBox(
                          color: colors.surface,
                          child: Center(
                            child: _coverFrame == null
                                ? AppIcon(
                                    AppIcons.filmReelOutlined,
                                    size: 40,
                                    color: colors.textSecondary,
                                  )
                                : Image.memory(
                                    _coverFrame!,
                                    fit: BoxFit.cover,
                                    width: 198,
                                    height: 352,
                                  ),
                          ),
                        )
                      : FittedBox(
                          fit: BoxFit.cover,
                          clipBehavior: Clip.hardEdge,
                          child: SizedBox(
                            width: c.value.size.width,
                            height: c.value.size.height,
                            child: VideoPlayer(c),
                          ),
                        ),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            _Tabs(
              labels: [
                t.t('video.edit.tab.trim'),
                t.t('video.edit.tab.cover'),
              ],
              index: _tab,
              onChanged: (i) {
                setState(() => _tab = i);
                unawaited(_showTab());
              },
            ),
            const SizedBox(height: AppSpacing.lg),
            _FrameStrip(
              cut: _cut,
              frames: _frames,
              cover: _tab == 1,
              semanticLabel: t.t(
                _tab == 0 ? 'video.edit.tab.trim' : 'video.edit.tab.cover',
              ),
              onRange: _setRange,
              onCover: _setCover,
            ),
            const SizedBox(height: AppSpacing.md),
            if (_tab == 0) ...[
              Row(
                children: [
                  _Info(
                    label: t.t('video.edit.start'),
                    value: formatCutTime(_cut.startMs),
                  ),
                  _Info(
                    label: t.t('video.edit.length'),
                    value: formatCutTime(_cut.lengthMs),
                    center: true,
                  ),
                  _Info(
                    label: t.t('video.edit.end'),
                    value: formatCutTime(_cut.endMs),
                    end: true,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                t.t(
                  'video.edit.max',
                  {'max': '${(widget.maxMs / 1000).round()}'},
                ),
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
            ] else ...[
              Text(
                t.t('video.edit.frame', {'time': formatCutTime(_cut.coverMs)}),
                style: type.titleMedium,
              ),
              const SizedBox(height: AppSpacing.md),
              Semantics(
                button: true,
                label: t.t('video.edit.uploadCover'),
                excludeSemantics: true,
                child: AppPressable(
                  onTap: _uploadingCover ? null : _pickCover,
                  child: Container(
                    height: 44,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(AppRadii.field),
                      border: Border.all(color: colors.border),
                    ),
                    child: _uploadingCover
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              AppIcon(
                                AppIcons.photoLibraryOutlined,
                                color: colors.iconTint,
                                size: 20,
                              ),
                              const SizedBox(width: AppSpacing.sm),
                              Flexible(
                                child: FitText(
                                  t.t('video.edit.uploadCover'),
                                  style: type.body.copyWith(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              _GridPreview(frame: _custom ?? _coverFrame),
              const SizedBox(height: AppSpacing.sm),
              Text(
                t.t('video.edit.gridHint'),
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Tabs extends StatelessWidget {
  const _Tabs({
    required this.labels,
    required this.index,
    required this.onChanged,
  });

  final List<String> labels;
  final int index;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.field),
        border: Border.all(color: colors.border),
      ),
      padding: const EdgeInsets.all(3),
      child: Row(
        children: [
          for (final (i, label) in labels.indexed)
            Expanded(
              child: Semantics(
                button: true,
                selected: i == index,
                label: label,
                excludeSemantics: true,
                child: AppPressable(
                  onTap: () => onChanged(i),
                  child: Container(
                    height: 36,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: i == index ? colors.goldTint : null,
                      borderRadius: BorderRadius.circular(AppRadii.field - 3),
                    ),
                    child: FitText(
                      label,
                      style: type.body.copyWith(
                        color: i == index ? colors.goldDark : colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Info extends StatelessWidget {
  const _Info({
    required this.label,
    required this.value,
    this.center = false,
    this.end = false,
  });

  final String label;
  final String value;
  final bool center;
  final bool end;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final align = center
        ? CrossAxisAlignment.center
        : end
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start;
    return Expanded(
      child: Column(
        crossAxisAlignment: align,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
          Text(value, maxLines: 1, style: type.titleMedium),
        ],
      ),
    );
  }
}

/// The frames of the whole video in a row, with the chosen part framed in
/// gold (Trim) or a white frame on the cover instant (Cover).
class _FrameStrip extends StatefulWidget {
  const _FrameStrip({
    required this.cut,
    required this.frames,
    required this.cover,
    required this.semanticLabel,
    required this.onRange,
    required this.onCover,
  });

  final ReelCut cut;
  final List<Uint8List?> frames;
  final bool cover;
  final String semanticLabel;
  final void Function(int start, int end) onRange;
  final ValueChanged<int> onCover;

  @override
  State<_FrameStrip> createState() => _FrameStripState();
}

enum _Drag { start, end, cover }

class _FrameStripState extends State<_FrameStrip> {
  _Drag? _drag;

  double _x(int ms, double w) => ms / widget.cut.totalMs * w;

  int _ms(double x, double w) =>
      (x / w * widget.cut.totalMs).round().clamp(0, widget.cut.totalMs);

  void _begin(double x, double w) {
    final cut = widget.cut;
    if (widget.cover) {
      _drag = _Drag.cover;
      widget.onCover(_ms(x, w));
      return;
    }
    final toStart = (x - _x(cut.startMs, w)).abs();
    final toEnd = (x - _x(cut.endMs, w)).abs();
    _drag = toStart <= toEnd ? _Drag.start : _Drag.end;
  }

  void _move(double x, double w) {
    final cut = widget.cut;
    final ms = _ms(x, w);
    switch (_drag) {
      case _Drag.start:
        widget.onRange(ms, cut.endMs);
      case _Drag.end:
        widget.onRange(cut.startMs, ms);
      case _Drag.cover:
        widget.onCover(ms);
      case null:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return LayoutBuilder(
      builder: (context, box) {
        final w = box.maxWidth;
        final cut = widget.cut;
        final left = _x(cut.startMs, w);
        final right = _x(cut.endMs, w);
        final coverX = (_x(cut.coverMs, w) - _kCoverWidth / 2)
            .clamp(0.0, w - _kCoverWidth);
        return Semantics(
          label: widget.semanticLabel,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onHorizontalDragStart: (d) => _begin(d.localPosition.dx, w),
            onHorizontalDragUpdate: (d) => _move(d.localPosition.dx, w),
            onHorizontalDragEnd: (_) => _drag = null,
            onTapDown: (d) {
              if (widget.cover) widget.onCover(_ms(d.localPosition.dx, w));
            },
            child: SizedBox(
              height: _kStripHeight,
              width: w,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Positioned.fill(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadii.field),
                      child: Row(
                        children: [
                          for (final f in widget.frames)
                            Expanded(
                              child: f == null
                                  ? ColoredBox(
                                      color: colors.surface,
                                      child: const SizedBox.expand(),
                                    )
                                  : Image.memory(
                                      f,
                                      fit: BoxFit.cover,
                                      height: _kStripHeight,
                                      gaplessPlayback: true,
                                    ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  // Outside the chosen part: dimmed.
                  Positioned(
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: left,
                    child: const ColoredBox(color: Colors.black54),
                  ),
                  Positioned(
                    left: right,
                    top: 0,
                    bottom: 0,
                    right: 0,
                    child: const ColoredBox(color: Colors.black54),
                  ),
                  // The gold frame of the chosen part.
                  Positioned(
                    left: left,
                    width: (right - left).clamp(0.0, w),
                    top: 0,
                    bottom: 0,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        border: Border.symmetric(
                          horizontal: BorderSide(color: colors.gold, width: 3),
                          vertical: BorderSide(
                            color: colors.gold,
                            width: widget.cover ? 1 : _kHandleWidth / 2,
                          ),
                        ),
                      ),
                    ),
                  ),
                  if (widget.cover)
                    Positioned(
                      left: coverX,
                      width: _kCoverWidth,
                      top: -2,
                      bottom: -2,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: Colors.white, width: 3),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

/// How the cover looks among the profile's reels (a row of three).
class _GridPreview extends StatelessWidget {
  const _GridPreview({required this.frame});

  final Uint8List? frame;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    Widget cell({Uint8List? bytes, bool mine = false}) => Expanded(
          child: AspectRatio(
            aspectRatio: 3 / 4,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.field),
                border: Border.all(
                  color: mine ? colors.gold : colors.border,
                  width: mine ? 2 : 1,
                ),
              ),
              child: bytes == null
                  ? null
                  : ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadii.field - 1),
                      child: Image.memory(
                        bytes,
                        fit: BoxFit.cover,
                        gaplessPlayback: true,
                      ),
                    ),
            ),
          ),
        );
    return Row(
      children: [
        cell(),
        const SizedBox(width: AppSpacing.xs),
        cell(bytes: frame, mine: true),
        const SizedBox(width: AppSpacing.xs),
        cell(),
      ],
    );
  }
}
