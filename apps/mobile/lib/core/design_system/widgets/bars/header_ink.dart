import 'package:flutter/material.dart';

/// Owner 2026-10-22 (Blue, Green): inside a coloured top bar the page's dark
/// ink would vanish, so icons that were drawn with the page `text` colour
/// (callers read it from the theme) are drawn in the header ink instead.
/// `AppIcon` and `AppBackButton` consult this.
class HeaderInk extends InheritedWidget {
  const HeaderInk({
    required this.pageText,
    required this.ink,
    required super.child,
    super.key,
  });

  final Color pageText;
  final Color ink;

  static HeaderInk? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<HeaderInk>();

  /// [color] mapped to the header ink when it is the page text colour.
  static Color? resolve(BuildContext context, Color? color) {
    final h = maybeOf(context);
    if (h == null || color == null || color != h.pageText) return color;
    return h.ink;
  }

  @override
  bool updateShouldNotify(HeaderInk old) =>
      old.pageText != pageText || old.ink != ink;
}

/// The coloured wash of a top bar; a plain [fill] when there is no gradient.
BoxDecoration headerDecoration({
  required Color fill,
  required List<Color>? gradient,
  BoxBorder? border,
}) =>
    BoxDecoration(
      color: gradient == null ? fill : null,
      gradient: gradient == null
          ? null
          : LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: gradient,
            ),
      border: border,
    );
