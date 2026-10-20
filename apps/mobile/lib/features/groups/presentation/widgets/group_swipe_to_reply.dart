import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Drag a bubble toward the start of the screen to reply to it (Telegram):
/// the bubble follows the finger, a reply icon appears behind it, and
/// letting go past the threshold calls [onReply]. Mirrors in RTL.
class GroupSwipeToReply extends StatefulWidget {
  const GroupSwipeToReply({
    required this.child,
    required this.onReply,
    required this.semanticLabel,
    super.key,
  });

  final Widget child;
  final VoidCallback onReply;
  final String semanticLabel;

  @override
  State<GroupSwipeToReply> createState() => _GroupSwipeToReplyState();
}

class _GroupSwipeToReplyState extends State<GroupSwipeToReply> {
  static const _threshold = 56.0;
  static const _max = 76.0;

  double _dx = 0;
  bool _dragging = false;
  bool _armed = false;

  void _update(DragUpdateDetails d, double sign) {
    final next = (_dx + d.delta.dx * sign).clamp(0.0, _max);
    if (!_armed && next >= _threshold) {
      _armed = true;
      HapticFeedback.selectionClick();
    } else if (_armed && next < _threshold) {
      _armed = false;
    }
    setState(() {
      _dragging = true;
      _dx = next;
    });
  }

  void _end() {
    final fire = _dx >= _threshold;
    setState(() {
      _dragging = false;
      _dx = 0;
      _armed = false;
    });
    if (fire) widget.onReply();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    // Toward the start edge: left in LTR, right in RTL.
    final sign = rtl ? 1.0 : -1.0;
    final progress = (_dx / _threshold).clamp(0.0, 1.0);
    final motion = _dragging || context.reduceMotion
        ? Duration.zero
        : const Duration(milliseconds: 160);
    final gesture = GestureDetector(
      behavior: HitTestBehavior.translucent,
      onHorizontalDragUpdate: (d) => _update(d, sign),
      onHorizontalDragEnd: (_) => _end(),
      onHorizontalDragCancel: _end,
      child: Stack(
        alignment: AlignmentDirectional.centerEnd,
        children: [
          Positioned.directional(
            textDirection: Directionality.of(context),
            end: 8,
            top: 0,
            bottom: 0,
            child: Center(
              child: Opacity(
                opacity: progress,
                child: Transform.scale(
                  scale: 0.6 + 0.4 * progress,
                  child: Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: colors.goldTint,
                    ),
                    child: AppIcon(
                      AppIcons.replyRounded,
                      size: 18,
                      color: colors.iconTint,
                    ),
                  ),
                ),
              ),
            ),
          ),
          AnimatedContainer(
            duration: motion,
            curve: Curves.easeOut,
            transform: Matrix4.translationValues(sign * _dx, 0, 0),
            child: widget.child,
          ),
        ],
      ),
    );
    return Semantics(
      customSemanticsActions: {
        CustomSemanticsAction(label: widget.semanticLabel): widget.onReply,
      },
      child: gesture,
    );
  }
}
