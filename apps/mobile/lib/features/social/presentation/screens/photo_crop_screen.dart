import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// How one photo sits in its frame: the zoom over «fills the frame» (1 =
/// just covers it) and the shift of the photo's centre, as a share of the
/// frame's width / height.
@immutable
class PhotoFraming {
  const PhotoFraming({this.zoom = 1, this.dx = 0, this.dy = 0});

  final double zoom;
  final double dx;
  final double dy;

  @override
  bool operator ==(Object other) =>
      other is PhotoFraming &&
      other.zoom == zoom &&
      other.dx == dx &&
      other.dy == dy;

  @override
  int get hashCode => Object.hash(zoom, dx, dy);
}

/// The frame of a post's photos (Instagram): square, or the first photo's
/// own shape kept between 4:5 (tall) and 1.91:1 (wide).
enum PhotoFrame { original, square }

/// Instagram's bounds for a photo's shape.
const double kPhotoMinAspect = 0.8;
const double kPhotoMaxAspect = 1.91;

/// What the framing screen returns: the set's frame, each photo's
/// framing, and each photo cut to it — null where nothing changed (that
/// photo keeps its upload).
typedef FramedPhotos = ({
  PhotoFrame frame,
  List<PhotoFraming> framings,
  List<Uint8List?> photos,
});

/// Owner 2026-10-19: after picking photos, each one (all nine) can be moved
/// with a finger and zoomed to choose what shows in the post, with an
/// «original / square» switch for the set — as in Instagram. The post shows
/// exactly the chosen frame (the photo is cut to it before the upload).
class PhotoCropScreen extends ConsumerStatefulWidget {
  const PhotoCropScreen({
    required this.photos,
    this.framings,
    this.frame = PhotoFrame.original,
    this.fresh,
    this.start = 0,
    super.key,
  });

  /// The photos as picked (never an already cut one).
  final List<Uint8List> photos;

  /// How each photo was framed before (null: all centred).
  final List<PhotoFraming>? framings;
  final PhotoFrame frame;

  /// Photos never cut yet (null: all of them).
  final Set<int>? fresh;

  /// The photo shown first.
  final int start;

  /// Opens the framing; null = closed without a choice.
  static Future<FramedPhotos?> open(
    BuildContext context, {
    required List<Uint8List> photos,
    List<PhotoFraming>? framings,
    PhotoFrame frame = PhotoFrame.original,
    Set<int>? fresh,
    int start = 0,
  }) =>
      Navigator.of(context).push<FramedPhotos>(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (_) => PhotoCropScreen(
            photos: photos,
            framings: framings,
            frame: frame,
            fresh: fresh,
            start: start,
          ),
        ),
      );

  @override
  ConsumerState<PhotoCropScreen> createState() => _PhotoCropScreenState();
}

class _PhotoCropScreenState extends ConsumerState<PhotoCropScreen> {
  final _images = <ui.Image?>[];
  late final List<PhotoFraming> _framing = [
    for (var i = 0; i < widget.photos.length; i++)
      widget.framings?.elementAtOrNull(i) ?? const PhotoFraming(),
  ];
  late PhotoFrame _frame = widget.frame;
  late int _index = widget.start.clamp(0, widget.photos.length - 1);
  bool _busy = false;
  bool _dragging = false;

  // Gesture start values.
  double _startZoom = 1;
  Offset _startShift = Offset.zero;
  Offset _startFocal = Offset.zero;

  @override
  void initState() {
    super.initState();
    _images.addAll(List.filled(widget.photos.length, null));
    for (var i = 0; i < widget.photos.length; i++) {
      _decode(i);
    }
  }

  Future<void> _decode(int i) async {
    try {
      final codec = await ui.instantiateImageCodec(widget.photos[i]);
      final frame = await codec.getNextFrame();
      if (!mounted) {
        frame.image.dispose();
        return;
      }
      setState(() => _images[i] = frame.image);
    } on Object {
      // A photo the device can't draw is uploaded as it is.
    }
  }

  @override
  void dispose() {
    for (final img in _images) {
      img?.dispose();
    }
    super.dispose();
  }

  /// The set's shape: square, or the first photo's own (Instagram bounds).
  double get _aspect {
    if (_frame == PhotoFrame.square) return 1;
    final first = _images.isEmpty ? null : _images.first;
    if (first == null) return 1;
    return (first.width / first.height).clamp(kPhotoMinAspect, kPhotoMaxAspect);
  }

  /// Keeps the photo covering the whole frame.
  PhotoFraming _clamp(PhotoFraming f, ui.Image img, Size frame) {
    final zoom = f.zoom.clamp(1.0, 5.0);
    final cover =
        math.max(frame.width / img.width, frame.height / img.height) * zoom;
    final maxDx = (img.width * cover - frame.width) / 2 / frame.width;
    final maxDy = (img.height * cover - frame.height) / 2 / frame.height;
    return PhotoFraming(
      zoom: zoom,
      dx: f.dx.clamp(-maxDx, maxDx),
      dy: f.dy.clamp(-maxDy, maxDy),
    );
  }

  /// Cuts photo [i] to its frame: at most 1080 px wide (Instagram), PNG.
  Future<Uint8List> _render(int i) async {
    final img = _images[i];
    if (img == null) return widget.photos[i];
    final aspect = _aspect;
    // The frame in the photo's own pixels.
    const frame = Size(1000, 1000);
    final box = Size(frame.width, frame.width / aspect);
    final f = _clamp(_framing[i], img, box);
    final scale =
        math.max(box.width / img.width, box.height / img.height) * f.zoom;
    final left = (img.width * scale - box.width) / 2 - f.dx * box.width;
    final top = (img.height * scale - box.height) / 2 - f.dy * box.height;
    final src = Rect.fromLTWH(
      left / scale,
      top / scale,
      box.width / scale,
      box.height / scale,
    );
    final outW = math.min(1080, src.width.round()).toDouble();
    final out = Size(outW, (outW / aspect).roundToDouble());
    final rec = ui.PictureRecorder();
    Canvas(rec).drawImageRect(
      img,
      src,
      Offset.zero & out,
      Paint()..filterQuality = FilterQuality.high,
    );
    final picture = rec.endRecording();
    final cut = await picture.toImage(out.width.toInt(), out.height.toInt());
    picture.dispose();
    final data = await cut.toByteData(format: ui.ImageByteFormat.png);
    cut.dispose();
    return data == null ? widget.photos[i] : data.buffer.asUint8List();
  }

  Future<void> _done() async {
    if (_busy) return;
    setState(() => _busy = true);
    final out = <Uint8List?>[];
    for (var i = 0; i < widget.photos.length; i++) {
      final same = _frame == widget.frame &&
          !(widget.fresh?.contains(i) ?? true) &&
          i < (widget.framings?.length ?? 0) &&
          widget.framings![i] == _framing[i];
      out.add(same ? null : await _render(i));
    }
    if (mounted) {
      Navigator.of(context).pop(
        (frame: _frame, framings: List.of(_framing), photos: out),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppIconButton(
          icon: const AppIcon(AppIcons.closeRounded),
          semanticLabel: t.t('common.close'),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(t.t('post.create.title')),
        actions: [
          TextButton(
            key: const ValueKey('photo-crop-done'),
            onPressed: _busy ? null : _done,
            child: _busy
                ? SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: colors.gold,
                    ),
                  )
                : Text(
                    t.t('common.done'),
                    style: type.body.copyWith(
                      color: colors.gold,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            LayoutBuilder(
              builder: (context, c) {
                final aspect = _aspect;
                final width = c.maxWidth;
                final frame = Size(width, width / aspect);
                return SizedBox(
                  width: frame.width,
                  height: frame.height,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      _framed(frame),
                      if (_dragging) const IgnorePointer(child: _ThirdsGrid()),
                      PositionedDirectional(
                        start: AppSpacing.md,
                        bottom: AppSpacing.md,
                        child: _FrameSwitch(
                          label: t.t('post.crop.fit'),
                          onTap: () => setState(() {
                            _frame = _frame == PhotoFrame.square
                                ? PhotoFrame.original
                                : PhotoFrame.square;
                            // A new shape starts every photo centred.
                            _framing.fillRange(
                              0,
                              _framing.length,
                              const PhotoFraming(),
                            );
                          }),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
            if (widget.photos.length > 1) ...[
              const SizedBox(height: AppSpacing.md),
              SizedBox(
                height: 64,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.screenSide,
                  ),
                  itemCount: widget.photos.length,
                  separatorBuilder: (_, __) =>
                      const SizedBox(width: AppSpacing.sm),
                  itemBuilder: (context, i) => GestureDetector(
                    key: ValueKey('photo-crop-thumb-$i'),
                    onTap: () => setState(() => _index = i),
                    child: Container(
                      width: 64,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: i == _index ? colors.gold : colors.border,
                          width: i == _index ? 2 : 1,
                        ),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: Image.memory(
                        widget.photos[i],
                        fit: BoxFit.cover,
                        cacheWidth: 192,
                        gaplessPlayback: true,
                        errorBuilder: (_, __, ___) =>
                            ColoredBox(color: colors.skeletonBase),
                      ),
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

  /// The chosen photo in its frame: a finger moves it, two fingers zoom.
  Widget _framed(Size frame) {
    final img = _images[_index];
    if (img == null) {
      return ColoredBox(
        color: Colors.black,
        child: Image.memory(widget.photos[_index], fit: BoxFit.cover),
      );
    }
    final f = _clamp(_framing[_index], img, frame);
    final scale =
        math.max(frame.width / img.width, frame.height / img.height) * f.zoom;
    final w = img.width * scale;
    final h = img.height * scale;
    return GestureDetector(
      key: const ValueKey('photo-crop-frame'),
      onScaleStart: (d) {
        _startZoom = f.zoom;
        _startShift = Offset(f.dx * frame.width, f.dy * frame.height);
        _startFocal = d.localFocalPoint;
        setState(() => _dragging = true);
      },
      onScaleUpdate: (d) {
        final shift = _startShift + (d.localFocalPoint - _startFocal);
        setState(() {
          _framing[_index] = _clamp(
            PhotoFraming(
              zoom: _startZoom * d.scale,
              dx: shift.dx / frame.width,
              dy: shift.dy / frame.height,
            ),
            img,
            frame,
          );
        });
      },
      onScaleEnd: (_) => setState(() => _dragging = false),
      child: ClipRect(
        child: ColoredBox(
          color: Colors.black,
          child: OverflowBox(
            maxWidth: double.infinity,
            maxHeight: double.infinity,
            child: Transform.translate(
              offset: Offset(f.dx * frame.width, f.dy * frame.height),
              child: SizedBox(
                width: w,
                height: h,
                child: RawImage(image: img, fit: BoxFit.fill),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Instagram's «original / square» round button over the frame.
class _FrameSwitch extends StatelessWidget {
  const _FrameSwitch({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: label,
        child: GestureDetector(
          key: const ValueKey('photo-crop-switch'),
          onTap: onTap,
          child: Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.55),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: const AppIcon(
              AppIcons.cornersOut,
              size: 20,
              color: Colors.white,
            ),
          ),
        ),
      );
}

/// The thirds grid shown while a photo is moved.
class _ThirdsGrid extends StatelessWidget {
  const _ThirdsGrid();

  @override
  Widget build(BuildContext context) => CustomPaint(painter: _ThirdsPainter());
}

class _ThirdsPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = Colors.white.withValues(alpha: 0.6)
      ..strokeWidth = 0.7;
    for (var i = 1; i < 3; i++) {
      final x = size.width * i / 3;
      final y = size.height * i / 3;
      canvas
        ..drawLine(Offset(x, 0), Offset(x, size.height), p)
        ..drawLine(Offset(0, y), Offset(size.width, y), p);
    }
  }

  @override
  bool shouldRepaint(_ThirdsPainter old) => false;
}
