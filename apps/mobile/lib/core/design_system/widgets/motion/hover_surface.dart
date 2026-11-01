import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';

/// Desktop web plan 2026-10-28 §7: the one hover effect of the desktop web
/// — the row or item under the mouse gets a light tint (the text colour at
/// 4 %) and the hand cursor. Only a colour behind [child]: no opacity
/// layer, no extra repaint of what is inside. On a phone or a tablet-width
/// window (and in the app) the child is returned as it is.
class HoverSurface extends StatefulWidget {
  const HoverSurface({
    required this.child,
    this.borderRadius,
    this.clickable = true,
    super.key,
  });

  final Widget child;
  final BorderRadius? borderRadius;

  /// Shows the hand cursor (the item opens something on a click).
  final bool clickable;

  /// The tint (of the theme's text colour) while hovered.
  static const double tint = 0.04;

  @override
  State<HoverSurface> createState() => _HoverSurfaceState();
}

class _HoverSurfaceState extends State<HoverSurface> {
  bool _hover = false;

  void _set(bool v) {
    if (_hover != v) setState(() => _hover = v);
  }

  @override
  Widget build(BuildContext context) {
    if (!isDesktopWindow(context)) return widget.child;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return MouseRegion(
      cursor: widget.clickable ? SystemMouseCursors.click : MouseCursor.defer,
      onEnter: (_) => _set(true),
      onExit: (_) => _set(false),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: _hover
              ? colors.text.withValues(alpha: HoverSurface.tint)
              : const Color(0x00000000),
          borderRadius: widget.borderRadius,
        ),
        child: widget.child,
      ),
    );
  }
}
