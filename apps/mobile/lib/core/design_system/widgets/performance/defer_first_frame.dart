import 'package:flutter/widgets.dart';

/// Builds [child] one frame after this widget appears and shows
/// [placeholder] (nothing by default) meanwhile. A heavy first build then
/// no longer sits in the same frame as the route / sheet animation's first
/// step, so neither frame goes over the 16 ms budget.
class DeferFirstFrame extends StatefulWidget {
  const DeferFirstFrame({
    required this.child,
    this.placeholder = const SizedBox.shrink(),
    super.key,
  });

  final Widget child;
  final Widget placeholder;

  @override
  State<DeferFirstFrame> createState() => _DeferFirstFrameState();
}

class _DeferFirstFrameState extends State<DeferFirstFrame> {
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() => _ready = true);
    });
  }

  @override
  Widget build(BuildContext context) =>
      _ready ? widget.child : widget.placeholder;
}
