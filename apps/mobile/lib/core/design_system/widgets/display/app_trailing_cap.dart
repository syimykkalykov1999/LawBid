import 'package:flutter/widgets.dart';

/// Wraps the trailing item of a row (a value, badge, pill or counter) that
/// follows an [Expanded] label: the item keeps its natural width at the end
/// edge, capped at [maxScreenFraction] of the screen width, so a long
/// translation ellipsizes inside it instead of squeezing the label.
///
/// Owner 2026-10-05: a `Flexible` there split the row in half — values,
/// chevrons, badges and progress bars drifted to the middle. Use this
/// instead. The cap is taken from the screen, not a LayoutBuilder, so the
/// row still works inside IntrinsicHeight.
class AppTrailingCap extends StatelessWidget {
  const AppTrailingCap({
    required this.child,
    super.key,
    this.maxScreenFraction = 0.36,
  });

  final Widget child;
  final double maxScreenFraction;

  @override
  Widget build(BuildContext context) => ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * maxScreenFraction,
        ),
        child: child,
      );
}
