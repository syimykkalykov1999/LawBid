import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/media/image_size.dart';
import 'package:lawbid/features/chat/application/image_edit.dart';

/// Owner 2026-10-22 (WhatsApp): crop a photo before sending it - a frame
/// with four corner handles over the picture, ratio chips (free, square,
/// 4:3, 16:9). Pops the kept part as fractions of the picture (an
/// [ImageEdit] without turns) or null.
class ImageCropScreen extends ConsumerStatefulWidget {
  const ImageCropScreen({required this.bytes, super.key});

  final Uint8List bytes;

  @override
  ConsumerState<ImageCropScreen> createState() => _ImageCropScreenState();
}

class _ImageCropScreenState extends ConsumerState<ImageCropScreen> {
  Size? _px;

  /// The frame as fractions of the picture.
  Rect _crop = const Rect.fromLTRB(0, 0, 1, 1);

  /// Width / height the frame keeps; null: free.
  double? _ratio;
  _Drag? _drag;

  static const _minFrac = 0.08;

  @override
  void initState() {
    super.initState();
    imageSizeOf(widget.bytes).then((s) {
      if (mounted) setState(() => _px = s);
    });
  }

  void _setRatio(double? r) {
    final px = _px;
    if (px == null) return;
    setState(() {
      _ratio = r;
      if (r == null) return;
      // The biggest centred frame of that ratio.
      final imgRatio = px.width / px.height;
      double w;
      double h;
      if (r >= imgRatio) {
        w = 1;
        h = imgRatio / r;
      } else {
        h = 1;
        w = r / imgRatio;
      }
      _crop = Rect.fromCenter(
        center: const Offset(0.5, 0.5),
        width: w,
        height: h,
      );
    });
  }

  void _onPanStart(DragStartDetails d, Rect shown) {
    const hit = 30.0;
    final p = d.localPosition;
    final corners = {
      _Drag.topLeft: shown.topLeft,
      _Drag.topRight: shown.topRight,
      _Drag.bottomLeft: shown.bottomLeft,
      _Drag.bottomRight: shown.bottomRight,
    };
    _Drag? best;
    var bestDist = hit;
    corners.forEach((k, v) {
      final dist = (v - p).distance;
      if (dist < bestDist) {
        bestDist = dist;
        best = k;
      }
    });
    _drag = best ?? (shown.contains(p) ? _Drag.move : null);
  }

  void _onPanUpdate(DragUpdateDetails d, Rect image) {
    final mode = _drag;
    final px = _px;
    if (mode == null || px == null) return;
    final dx = d.delta.dx / image.width;
    final dy = d.delta.dy / image.height;
    var c = _crop;
    if (mode == _Drag.move) {
      final shift = Offset(
        (c.left + dx).clamp(0, 1 - c.width) - c.left,
        (c.top + dy).clamp(0, 1 - c.height) - c.top,
      );
      setState(() => _crop = c.shift(shift));
      return;
    }
    // The corner opposite the dragged one stays put.
    final anchor = switch (mode) {
      _Drag.topLeft => c.bottomRight,
      _Drag.topRight => c.bottomLeft,
      _Drag.bottomLeft => c.topRight,
      _ => c.topLeft,
    };
    var moved = switch (mode) {
      _Drag.topLeft => c.topLeft,
      _Drag.topRight => c.topRight,
      _Drag.bottomLeft => c.bottomLeft,
      _ => c.bottomRight,
    }
        .translate(dx, dy);
    moved = Offset(moved.dx.clamp(0, 1), moved.dy.clamp(0, 1));
    final r = _ratio;
    if (r != null) {
      // Keep width / height in PIXELS; the width leads.
      final w = (moved.dx - anchor.dx).abs();
      final hPx = w * px.width / r;
      final h = (hPx / px.height).clamp(_minFrac, 1.0);
      final sy = moved.dy >= anchor.dy ? 1.0 : -1.0;
      final ny = (anchor.dy + sy * h).clamp(0.0, 1.0);
      moved = Offset(moved.dx, ny);
    }
    c = Rect.fromPoints(anchor, moved);
    if (c.width < _minFrac || c.height < _minFrac) return;
    setState(() => _crop = c);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final px = _px;
    return Scaffold(
      backgroundColor: ChatColors.viewerBg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
              child: Row(
                children: [
                  _RoundButton(
                    icon: AppIcons.closeRounded,
                    label: t.t('common.cancel'),
                    onTap: () => Navigator.of(context).pop(),
                  ),
                  const Spacer(),
                  _RoundButton(
                    key: const ValueKey('crop-done'),
                    icon: AppIcons.checkRounded,
                    label: t.t('common.done'),
                    onTap: () => Navigator.of(context).pop(
                      ImageEdit(
                        crop: _crop,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: px == null
                  ? const SizedBox.shrink()
                  : LayoutBuilder(
                      builder: (context, box) {
                        final scale = math.min(
                          box.maxWidth / px.width,
                          box.maxHeight / px.height,
                        );
                        final w = px.width * scale;
                        final h = px.height * scale;
                        final image = Rect.fromLTWH(
                          (box.maxWidth - w) / 2,
                          (box.maxHeight - h) / 2,
                          w,
                          h,
                        );
                        final shown = Rect.fromLTRB(
                          image.left + _crop.left * w,
                          image.top + _crop.top * h,
                          image.left + _crop.right * w,
                          image.top + _crop.bottom * h,
                        );
                        return GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onPanStart: (d) => _onPanStart(d, shown),
                          onPanUpdate: (d) => _onPanUpdate(d, image),
                          onPanEnd: (_) => _drag = null,
                          child: Stack(
                            children: [
                              Positioned.fromRect(
                                rect: image,
                                child: Image.memory(
                                  widget.bytes,
                                  fit: BoxFit.fill,
                                ),
                              ),
                              Positioned.fill(
                                child: CustomPaint(
                                  key: const ValueKey('crop-frame'),
                                  painter: _FramePainter(shown),
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _RatioChip(
                    label: t.t('chat.preview.free'),
                    selected: _ratio == null,
                    onTap: () => setState(() => _ratio = null),
                  ),
                  _RatioChip(
                    label: '1:1',
                    selected: _ratio == 1,
                    onTap: () => _setRatio(1),
                  ),
                  _RatioChip(
                    label: '4:3',
                    selected: _ratio == 4 / 3,
                    onTap: () => _setRatio(4 / 3),
                  ),
                  _RatioChip(
                    label: '16:9',
                    selected: _ratio == 16 / 9,
                    onTap: () => _setRatio(16 / 9),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

enum _Drag { topLeft, topRight, bottomLeft, bottomRight, move }

class _FramePainter extends CustomPainter {
  _FramePainter(this.frame);

  final Rect frame;

  @override
  void paint(Canvas canvas, Size size) {
    final dim = Paint()..color = ChatColors.viewerBar;
    final whole = Path()..addRect(Offset.zero & size);
    final hole = Path()..addRect(frame);
    canvas.drawPath(
      Path.combine(PathOperation.difference, whole, hole),
      dim,
    );
    final line = Paint()
      ..color = ChatColors.onViewer
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    canvas.drawRect(frame, line);
    final grid = Paint()
      ..color = ChatColors.onViewerMuted
      ..strokeWidth = 0.5;
    for (var i = 1; i < 3; i++) {
      final x = frame.left + frame.width * i / 3;
      final y = frame.top + frame.height * i / 3;
      canvas
        ..drawLine(Offset(x, frame.top), Offset(x, frame.bottom), grid)
        ..drawLine(Offset(frame.left, y), Offset(frame.right, y), grid);
    }
    final handle = Paint()..color = ChatColors.onViewer;
    for (final c in [
      frame.topLeft,
      frame.topRight,
      frame.bottomLeft,
      frame.bottomRight,
    ]) {
      canvas.drawCircle(c, 7, handle);
    }
  }

  @override
  bool shouldRepaint(_FramePainter old) => old.frame != frame;
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    required this.icon,
    required this.label,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: SizedBox(
          width: 48,
          height: 48,
          child: Center(child: AppIcon(icon, color: ChatColors.onViewer)),
        ),
      ),
    );
  }
}

class _RatioChip extends StatelessWidget {
  const _RatioChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 56, minHeight: 44),
          child: Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppRadii.pill),
                color: selected ? ChatColors.onViewer : ChatColors.clear,
                border: Border.all(color: ChatColors.onViewerMuted),
              ),
              child: Text(
                label,
                style: type.caption.copyWith(
                  color: selected ? ChatColors.viewerBg : ChatColors.onViewer,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The round icon button of the dark viewer screens (shared with the
/// preview).
class ViewerButton extends StatelessWidget {
  const ViewerButton({
    required this.icon,
    required this.label,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) =>
      _RoundButton(icon: icon, label: label, onTap: onTap);
}
