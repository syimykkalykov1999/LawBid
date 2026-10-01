import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';

/// Drag handle at the top of modal bottom sheets (decorative).
class AppSheetHandle extends StatelessWidget {
  const AppSheetHandle({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return ExcludeSemantics(
      child: Center(
        child: Container(
          width: AppSizes.sheetHandleWidth,
          height: AppSizes.sheetHandleHeight,
          margin: const EdgeInsets.only(bottom: AppSpacing.lg),
          decoration: BoxDecoration(
            color: colors.border,
            borderRadius: BorderRadius.circular(AppRadii.pill),
          ),
        ),
      ),
    );
  }
}

/// Opens a modal bottom sheet with the design system's shape/colors
/// (UI modernization pass, 2026-09-27: 24px top radius, surface fill,
/// themed scrim). Thin wrapper over [showModalBottomSheet].
Future<T?> showAppBottomSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = false,
}) {
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    backgroundColor: colors.surface,
    showDragHandle: false,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(
        top: Radius.circular(AppRadii.sheet),
      ),
    ),
    // Owner 2026-10-01: every sheet closes with a swipe down — also when
    // its whole body scrolls (the list used to swallow the drag).
    builder: (ctx) => PullDownToClose(child: builder(ctx)),
  );
}

/// Pops the current route when the user pulls a scrollable down past its
/// top (Android overscroll or iOS bounce). Wraps sheets and modal pages.
class PullDownToClose extends StatefulWidget {
  const PullDownToClose({required this.child, this.threshold = 72, super.key});

  final Widget child;

  /// Pixels pulled beyond the top that close the route.
  final double threshold;

  @override
  State<PullDownToClose> createState() => _PullDownToCloseState();
}

class _PullDownToCloseState extends State<PullDownToClose> {
  double _pulled = 0;
  bool _closing = false;

  void _close() {
    if (_closing) return;
    _closing = true;
    Navigator.of(context).maybePop();
  }

  bool _onScroll(ScrollNotification n) {
    if (n.metrics.axis != Axis.vertical || _closing) return false;
    // A multiline field's own scrolling never closes the sheet (it would
    // lose what was typed).
    if (n.context?.findAncestorWidgetOfExactType<EditableText>() != null) {
      return false;
    }
    if (n is OverscrollNotification &&
        n.dragDetails != null &&
        n.overscroll < 0 &&
        n.metrics.pixels <= n.metrics.minScrollExtent) {
      _pulled -= n.overscroll;
      if (_pulled > widget.threshold) _close();
    } else if (n is ScrollUpdateNotification && n.dragDetails != null) {
      // iOS bounce: the list goes below its top.
      final below = n.metrics.minScrollExtent - n.metrics.pixels;
      if (below > widget.threshold) _close();
      if ((n.scrollDelta ?? 0) > 0) _pulled = 0;
    } else if (n is ScrollEndNotification) {
      _pulled = 0;
    }
    return false;
  }

  @override
  Widget build(BuildContext context) =>
      NotificationListener<ScrollNotification>(
        onNotification: _onScroll,
        child: widget.child,
      );
}
