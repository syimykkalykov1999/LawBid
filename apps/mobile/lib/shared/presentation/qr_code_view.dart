import 'package:flutter/material.dart';
import 'package:qr/qr.dart';

/// A QR code drawn with rounded dots and rounded finder squares (owner
/// 2026-10-20), with room cut out in the middle for a logo. Error
/// correction is level H (30%), so the hole, the rounded dots and a
/// slightly dirty screen all still scan.
///
/// The colours are NOT theme colours on purpose: a scanner needs dark dots
/// on a light plate in every theme, so the plate and dots are given by the
/// caller (a white plate, the navy of the brand).
class QrCodeView extends StatefulWidget {
  const QrCodeView({
    required this.data,
    required this.size,
    required this.dotColor,
    required this.plateColor,
    super.key,
    this.logo,
    this.semanticLabel,
  });

  final String data;

  /// Side of the whole square, plate and quiet zone included.
  final double size;
  final Color dotColor;
  final Color plateColor;

  /// Drawn in the middle, on a plate; about one fifth of the side.
  final Widget? logo;
  final String? semanticLabel;

  /// Share of the side the middle logo plate takes.
  static const double logoFraction = 0.2;

  @override
  State<QrCodeView> createState() => _QrCodeViewState();
}

class _QrCodeViewState extends State<QrCodeView> {
  late QrImage _image = _build(widget.data);

  static QrImage _build(String data) => QrImage(
        QrCode.fromData(data: data, errorCorrectLevel: QrErrorCorrectLevel.H),
      );

  @override
  void didUpdateWidget(QrCodeView old) {
    super.didUpdateWidget(old);
    if (old.data != widget.data) _image = _build(widget.data);
  }

  @override
  Widget build(BuildContext context) {
    final logoSide = widget.size * QrCodeView.logoFraction;
    return Semantics(
      image: true,
      label: widget.semanticLabel,
      child: ExcludeSemantics(
        child: SizedBox.square(
          dimension: widget.size,
          child: Stack(
            alignment: Alignment.center,
            children: [
              CustomPaint(
                size: Size.square(widget.size),
                painter: QrCodePainter(
                  image: _image,
                  dotColor: widget.dotColor,
                  plateColor: widget.plateColor,
                  hasLogo: widget.logo != null,
                ),
              ),
              if (widget.logo != null)
                SizedBox.square(dimension: logoSide, child: widget.logo),
            ],
          ),
        ),
      ),
    );
  }
}

/// Paints the modules of a [QrImage] (see [QrCodeView]).
class QrCodePainter extends CustomPainter {
  QrCodePainter({
    required this.image,
    required this.dotColor,
    required this.plateColor,
    required this.hasLogo,
  });

  final QrImage image;
  final Color dotColor;
  final Color plateColor;
  final bool hasLogo;

  /// Empty modules around the code (the standard quiet zone is 4; the white
  /// plate the caller puts it on supplies the rest).
  static const int quiet = 2;

  @override
  void paint(Canvas canvas, Size size) {
    final n = image.moduleCount;
    final total = n + quiet * 2;
    final cell = size.width / total;
    canvas.drawRect(Offset.zero & size, Paint()..color = plateColor);

    final dot = Paint()
      ..color = dotColor
      ..isAntiAlias = true;
    bool inFinder(int r, int c) =>
        (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

    // The hole for the logo: a module-aligned square in the middle.
    final holeModules = hasLogo
        ? (n * QrCodeView.logoFraction * 1.18).ceil() | 1 // odd → centred
        : 0;
    final holeStart = (n - holeModules) ~/ 2;
    bool inHole(int r, int c) =>
        hasLogo &&
        r >= holeStart &&
        r < holeStart + holeModules &&
        c >= holeStart &&
        c < holeStart + holeModules;

    final radius = Radius.circular(cell * 0.38);
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!image.isDark(r, c) || inFinder(r, c) || inHole(r, c)) continue;
        final rect = Rect.fromLTWH(
          (c + quiet) * cell + cell * 0.04,
          (r + quiet) * cell + cell * 0.04,
          cell * 0.92,
          cell * 0.92,
        );
        canvas.drawRRect(RRect.fromRectAndRadius(rect, radius), dot);
      }
    }

    // Finder squares: a rounded ring with a rounded dot inside.
    void finder(int row, int col) {
      final x = (col + quiet) * cell;
      final y = (row + quiet) * cell;
      final outer = RRect.fromRectAndRadius(
        Rect.fromLTWH(x, y, cell * 7, cell * 7),
        Radius.circular(cell * 2.2),
      );
      final inner = RRect.fromRectAndRadius(
        Rect.fromLTWH(x + cell, y + cell, cell * 5, cell * 5),
        Radius.circular(cell * 1.5),
      );
      final core = RRect.fromRectAndRadius(
        Rect.fromLTWH(x + cell * 2, y + cell * 2, cell * 3, cell * 3),
        Radius.circular(cell * 1.2),
      );
      canvas
        ..drawDRRect(outer, inner, dot)
        ..drawRRect(core, dot);
    }

    finder(0, 0);
    finder(0, n - 7);
    finder(n - 7, 0);
  }

  @override
  bool shouldRepaint(QrCodePainter old) =>
      old.image != image ||
      old.dotColor != dotColor ||
      old.plateColor != plateColor ||
      old.hasLogo != hasLogo;
}
