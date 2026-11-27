import 'package:flutter/rendering.dart';
import 'package:material_ui/material_ui.dart';

/// Owner 27.11 («скачки»): text whose weight follows a state (unread,
/// selected) without its box following it. A bold line is wider than a
/// regular one, so a label that turns bold rewraps or widens and moves
/// everything after it. Big apps keep the box of the heavier weight
/// (Telegram's unread chat rows, Material 3 tabs that reserve the bold
/// label's width); these widgets do the same and only repaint.
///
/// [BoldHeightText]: wrapping text that is always at least as tall as its
/// [boldWeight] version at the width it gets.
class BoldHeightText extends StatelessWidget {
  const BoldHeightText(
    this.text, {
    required this.bold,
    super.key,
    this.style,
    this.boldWeight = FontWeight.w600,
    this.regularWeight = FontWeight.w400,
    this.maxLines,
    this.overflow,
  });

  final String text;
  final bool bold;
  final TextStyle? style;
  final FontWeight boldWeight;
  final FontWeight regularWeight;
  final int? maxLines;
  final TextOverflow? overflow;

  @override
  Widget build(BuildContext context) {
    final base = DefaultTextStyle.of(context).style.merge(style);
    final shown = Text(
      text,
      maxLines: maxLines,
      overflow: overflow,
      style: base.copyWith(fontWeight: bold ? boldWeight : regularWeight),
    );
    if (bold) return shown;
    return MinTextHeight(
      text: text,
      style: base.copyWith(fontWeight: boldWeight),
      maxLines: maxLines,
      child: shown,
    );
  }
}

/// [BoldWidthText]: one line that is always as wide as the widest of its
/// regular and [boldWeight] versions (a chip or tab label that turns bold
/// when picked keeps its width, so its neighbours stay put).
class BoldWidthText extends StatelessWidget {
  const BoldWidthText(
    this.text, {
    required this.bold,
    super.key,
    this.style,
    this.boldWeight = FontWeight.w700,
    this.regularWeight,
    this.textAlign = TextAlign.center,
    this.overflow = TextOverflow.visible,
    this.textScaler,
  });

  /// Null: the screen's.
  final TextScaler? textScaler;
  final TextOverflow overflow;
  final String text;
  final bool bold;
  final TextStyle? style;
  final FontWeight boldWeight;

  /// Null: the weight of [style] (else the inherited one).
  final FontWeight? regularWeight;
  final TextAlign textAlign;

  @override
  Widget build(BuildContext context) {
    final base = DefaultTextStyle.of(context).style.merge(style);
    final regular = regularWeight ?? base.fontWeight ?? FontWeight.w400;
    final scaler = textScaler ?? MediaQuery.textScalerOf(context);
    final dir = Directionality.of(context);
    double widthOf(FontWeight w) {
      final p = TextPainter(
        text: TextSpan(text: text, style: base.copyWith(fontWeight: w)),
        textDirection: dir,
        textScaler: scaler,
        maxLines: 1,
      )..layout();
      final out = p.width;
      p.dispose();
      return out;
    }

    final width = [widthOf(regular), widthOf(boldWeight)]
        .reduce((a, b) => a > b ? a : b)
        .ceilToDouble();
    return SizedBox(
      width: width,
      child: Text(
        text,
        maxLines: 1,
        softWrap: false,
        overflow: overflow,
        textAlign: textAlign,
        textScaler: scaler,
        style: base.copyWith(fontWeight: bold ? boldWeight : regular),
      ),
    );
  }
}

/// One line as wide as the widest of [all] (the labels a toggle switches
/// between: «Подписаться» / «Вы подписаны»), so the button keeps its width
/// when it flips and nothing beside it moves.
class WidestOfText extends StatelessWidget {
  const WidestOfText(
    this.text, {
    required this.all,
    super.key,
    this.style,
    this.textAlign = TextAlign.center,
  });

  final String text;
  final List<String> all;
  final TextStyle? style;
  final TextAlign textAlign;

  @override
  Widget build(BuildContext context) {
    final base = DefaultTextStyle.of(context).style.merge(style);
    final scaler = MediaQuery.textScalerOf(context);
    final dir = Directionality.of(context);
    var width = 0.0;
    for (final s in {text, ...all}) {
      final p = TextPainter(
        text: TextSpan(text: s, style: base),
        textDirection: dir,
        textScaler: scaler,
        maxLines: 1,
      )..layout();
      if (p.width > width) width = p.width;
      p.dispose();
    }
    return SizedBox(
      width: width.ceilToDouble(),
      child: Text(
        text,
        maxLines: 1,
        softWrap: false,
        overflow: TextOverflow.visible,
        textAlign: textAlign,
        style: base,
      ),
    );
  }
}

/// Owner 27.11: lays [child] out at least as tall as [text] in [style] at the
/// width it gets — the room a label keeps while something else (a spinner)
/// stands in its place. A render object, not a LayoutBuilder, so intrinsic
/// sizing above it keeps working.
class MinTextHeight extends SingleChildRenderObjectWidget {
  const MinTextHeight({
    required this.text,
    required this.style,
    required super.child,
    this.maxLines,
    super.key,
  });

  final String text;
  final TextStyle style;
  final int? maxLines;

  @override
  RenderProxyBox createRenderObject(BuildContext context) =>
      _RenderMinHeightOf(
        painter: _painter(context),
      );

  @override
  void updateRenderObject(
    BuildContext context,
    RenderProxyBox renderObject,
  ) {
    (renderObject as _RenderMinHeightOf).painter = _painter(context);
  }

  TextPainter _painter(BuildContext context) => TextPainter(
        text: TextSpan(text: text, style: style),
        textDirection: Directionality.of(context),
        textScaler: MediaQuery.textScalerOf(context),
        maxLines: maxLines,
      );
}

class _RenderMinHeightOf extends RenderProxyBox {
  _RenderMinHeightOf({required TextPainter painter}) : _painter = painter;

  TextPainter _painter;
  TextPainter get painter => _painter;
  set painter(TextPainter value) {
    final old = _painter;
    if (old.text == value.text &&
        old.textScaler == value.textScaler &&
        old.textDirection == value.textDirection &&
        old.maxLines == value.maxLines) {
      value.dispose();
      return;
    }
    _painter = value;
    old.dispose();
    markNeedsLayout();
  }

  double _minAt(double width) {
    _painter.layout(maxWidth: width.isFinite ? width : double.infinity);
    return _painter.height;
  }

  @override
  double computeMinIntrinsicHeight(double width) {
    final h = super.computeMinIntrinsicHeight(width);
    final m = _minAt(width);
    return h > m ? h : m;
  }

  @override
  double computeMaxIntrinsicHeight(double width) {
    final h = super.computeMaxIntrinsicHeight(width);
    final m = _minAt(width);
    return h > m ? h : m;
  }

  @override
  Size computeDryLayout(BoxConstraints constraints) {
    final s = child?.getDryLayout(constraints) ?? constraints.smallest;
    final m = _minAt(constraints.maxWidth);
    return constraints.constrain(Size(s.width, s.height > m ? s.height : m));
  }

  @override
  void performLayout() {
    final c = child;
    if (c == null) {
      size = constraints.smallest;
      return;
    }
    c.layout(constraints, parentUsesSize: true);
    final m = _minAt(constraints.maxWidth);
    size = constraints.constrain(
      Size(c.size.width, c.size.height > m ? c.size.height : m),
    );
  }

  @override
  void dispose() {
    _painter.dispose();
    super.dispose();
  }
}
