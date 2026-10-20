import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-20: the strokes of a finger-drawn signature, and its export
/// to a PNG. No `dart:io`: it runs in the browser too.
class SignatureController extends ChangeNotifier {
  final List<List<Offset>> _strokes = [];
  Size _size = Size.zero;

  /// The strokes drawn so far, in pad coordinates.
  List<List<Offset>> get strokes => List.unmodifiable(_strokes);

  bool get isEmpty => _strokes.isEmpty;

  /// The pad tells its size so an export keeps the proportions.
  // ignore: use_setters_to_change_properties
  void attach(Size size) => _size = size;

  void start(Offset p) {
    _strokes.add([p]);
    notifyListeners();
  }

  void extend(Offset p) {
    if (_strokes.isEmpty) return;
    _strokes.last.add(p);
    notifyListeners();
  }

  void clear() {
    if (_strokes.isEmpty) return;
    _strokes.clear();
    notifyListeners();
  }

  /// The signature as a PNG [width] pixels wide (transparent background,
  /// dark ink), or null when nothing is drawn.
  Future<Uint8List?> toPng({double width = 600}) async {
    if (_strokes.isEmpty) return null;
    final pad = _size.isEmpty ? const Size(300, 150) : _size;
    final scale = width / pad.width;
    final w = width.round();
    final h = (pad.height * scale).round().clamp(1, 2000);
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder, Rect.fromLTWH(0, 0, w.toDouble(), h * 1.0))
      ..scale(scale);
    paintSignature(canvas, _strokes, Colors.black);
    final picture = recorder.endRecording();
    final image = await picture.toImage(w, h);
    try {
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      return data?.buffer.asUint8List();
    } finally {
      image.dispose();
      picture.dispose();
    }
  }

  /// The PNG as base64 for the API, or null when nothing is drawn.
  Future<String?> toBase64() async {
    final png = await toPng();
    return png == null ? null : base64Encode(png);
  }
}

/// Draws [strokes] as smooth round-capped lines (one tap leaves a dot).
void paintSignature(
  Canvas canvas,
  List<List<Offset>> strokes,
  Color ink, {
  double strokeWidth = 3,
}) {
  final line = Paint()
    ..color = ink
    ..style = PaintingStyle.stroke
    ..strokeWidth = strokeWidth
    ..strokeCap = StrokeCap.round
    ..strokeJoin = StrokeJoin.round
    ..isAntiAlias = true;
  final dot = Paint()
    ..color = ink
    ..style = PaintingStyle.fill
    ..isAntiAlias = true;
  for (final s in strokes) {
    if (s.isEmpty) continue;
    if (s.length == 1) {
      canvas.drawCircle(s.first, strokeWidth / 2, dot);
      continue;
    }
    final path = Path()..moveTo(s.first.dx, s.first.dy);
    for (var i = 1; i < s.length - 1; i++) {
      final mid = Offset(
        (s[i].dx + s[i + 1].dx) / 2,
        (s[i].dy + s[i + 1].dy) / 2,
      );
      path.quadraticBezierTo(s[i].dx, s[i].dy, mid.dx, mid.dy);
    }
    path.lineTo(s.last.dx, s.last.dy);
    canvas.drawPath(path, line);
  }
}

class _SignaturePainter extends CustomPainter {
  _SignaturePainter(this.controller, this.ink) : super(repaint: controller);

  final SignatureController controller;
  final Color ink;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.clipRect(Offset.zero & size);
    paintSignature(canvas, controller.strokes, ink);
  }

  @override
  bool shouldRepaint(_SignaturePainter old) =>
      old.controller != controller || old.ink != ink;
}

/// A box to draw a signature in with a finger or a mouse, with a "Clear"
/// button. The labels come from the caller (it knows the language).
class SignaturePad extends StatefulWidget {
  const SignaturePad({
    required this.controller,
    required this.hint,
    required this.clearLabel,
    required this.semanticLabel,
    this.height = 180,
    super.key,
  });

  final SignatureController controller;
  final String hint;
  final String clearLabel;
  final String semanticLabel;
  final double height;

  @override
  State<SignaturePad> createState() => _SignaturePadState();
}

class _SignaturePadState extends State<SignaturePad> {
  /// The pad takes the finger at once, so the sheet around it does not
  /// scroll while a stroke is drawn.
  static final _gestures = <Type, GestureRecognizerFactory>{
    EagerGestureRecognizer:
        GestureRecognizerFactoryWithHandlers<EagerGestureRecognizer>(
      EagerGestureRecognizer.new,
      (_) {},
    ),
  };

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = widget.controller;
    return Semantics(
      container: true,
      label: widget.semanticLabel,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadii.card),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: colors.surface,
            border: Border.all(color: colors.border),
            borderRadius: BorderRadius.circular(AppRadii.card),
          ),
          child: SizedBox(
            height: widget.height,
            width: double.infinity,
            child: Stack(
              children: [
                Positioned.fill(
                  child: ExcludeSemantics(
                    child: LayoutBuilder(
                      builder: (context, box) {
                        c.attach(box.biggest);
                        return RawGestureDetector(
                          gestures: _gestures,
                          child: Listener(
                            behavior: HitTestBehavior.opaque,
                            onPointerDown: (e) => c.start(e.localPosition),
                            onPointerMove: (e) => c.extend(e.localPosition),
                            child: CustomPaint(
                              painter: _SignaturePainter(c, colors.text),
                              child: ListenableBuilder(
                                listenable: c,
                                builder: (context, _) => c.isEmpty
                                    ? Center(
                                        child: Text(
                                          widget.hint,
                                          style: type.bodySmall.copyWith(
                                            color: colors.textSecondary,
                                          ),
                                        ),
                                      )
                                    : const SizedBox.expand(),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
                PositionedDirectional(
                  top: AppSpacing.xs,
                  end: AppSpacing.xs,
                  child: ListenableBuilder(
                    listenable: c,
                    builder: (context, _) => c.isEmpty
                        ? const SizedBox.shrink()
                        : Semantics(
                            button: true,
                            label: widget.clearLabel,
                            excludeSemantics: true,
                            onTap: c.clear,
                            child: InkWell(
                              onTap: c.clear,
                              borderRadius:
                                  BorderRadius.circular(AppRadii.pill),
                              child: ConstrainedBox(
                                constraints: const BoxConstraints(
                                  minHeight: 44,
                                  minWidth: 44,
                                ),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: AppSpacing.md,
                                  ),
                                  child: Center(
                                    widthFactor: 1,
                                    child: Text(
                                      widget.clearLabel,
                                      style: type.bodySmall.copyWith(
                                        fontWeight: FontWeight.w700,
                                        color: colors.accent,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
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
