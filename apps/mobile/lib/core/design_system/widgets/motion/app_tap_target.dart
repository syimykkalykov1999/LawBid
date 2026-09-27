import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

import 'package:lawbid/core/design_system/tokens/app_sizes.dart';

/// Grows the TAPPABLE and SEMANTIC area of [child] to at least [minSize]
/// without changing its layout or paint (docs/01 §8.4, docs/07 §9: touch
/// targets of at least 44x44; Android's accessibility scanner asks for
/// 48x48, which [AppSizes.hitTarget] satisfies on both platforms).
///
/// Why not padding: file 07 fixes several visual sizes below 48 (icon
/// buttons 44, the back chevron's 44 zone, 36px chips) and the welcome
/// screen's goldens must stay byte-identical. Like Material's
/// `MaterialTapTargetSize.padded`, but without the layout growth: taps that
/// land in the invisible margin are forwarded to the child's centre, and
/// the semantics node reports the enlarged rect so screen readers and the
/// tap-target guidelines see the real touch area.
///
/// The widget is a semantics boundary: put it OUTSIDE the child's
/// `Semantics(button: ..., label: ...)` so that label/action merge into the
/// enlarged node.
class AppTapTarget extends SingleChildRenderObjectWidget {
  const AppTapTarget({
    required Widget super.child,
    super.key,
    this.minSize = const Size.square(AppSizes.hitTarget),
  });

  final Size minSize;

  @override
  RenderAppTapTarget createRenderObject(BuildContext context) =>
      RenderAppTapTarget(minSize: minSize);

  @override
  void updateRenderObject(
    BuildContext context,
    RenderAppTapTarget renderObject,
  ) {
    renderObject.minSize = minSize;
  }
}

/// Render object behind [AppTapTarget].
class RenderAppTapTarget extends RenderProxyBox {
  RenderAppTapTarget({required Size minSize}) : _minSize = minSize;

  Size _minSize;
  Size get minSize => _minSize;
  set minSize(Size value) {
    if (_minSize == value) return;
    _minSize = value;
    markNeedsSemanticsUpdate();
  }

  /// The touch area: the layout box, grown symmetrically to [minSize].
  Rect get _targetRect {
    final dx = ((_minSize.width - size.width) / 2).clamp(0.0, double.infinity);
    final dy =
        ((_minSize.height - size.height) / 2).clamp(0.0, double.infinity);
    return Rect.fromLTRB(-dx, -dy, size.width + dx, size.height + dy);
  }

  @override
  Rect get semanticBounds => _targetRect;

  @override
  void describeSemanticsConfiguration(SemanticsConfiguration config) {
    super.describeSemanticsConfiguration(config);
    config.isSemanticBoundary = true;
  }

  @override
  bool hitTest(BoxHitTestResult result, {required Offset position}) {
    if (super.hitTest(result, position: position)) return true;
    final child = this.child;
    if (child == null || !_targetRect.contains(position)) return false;
    // Outside the painted box but inside the enlarged target: forward the
    // hit to the child's centre (same technique as Material's input
    // padding), then register this box too.
    final center = child.size.center(Offset.zero);
    final hit = result.addWithRawTransform(
      transform: MatrixUtils.forceToPoint(center),
      position: center,
      hitTest: (result, position) => child.hitTest(result, position: center),
    );
    if (hit) result.add(BoxHitTestEntry(this, position));
    return hit;
  }
}
