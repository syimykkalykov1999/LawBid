import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';

/// Owner row 88 (2026-11-13, WhatsApp / Telegram): a message that arrives
/// while the person is at the bottom of the chat grows in from its side
/// and pushes the older ones up, instead of appearing at once.
///
/// The motion is the insert animation of flutter_chat_ui's
/// `ChatAnimatedList` / `ChatMessage` (flyerhq/flutter_chat_ui,
/// Apache-2.0; see THIRD_PARTY_NOTICES.md): Fade over Size over Scale, all
/// on `Curves.linearToEaseOut`, 250 ms, scaled from the right edge for own
/// messages and the left edge for others. Only [animate] = true rows move,
/// and only on their first build; reduce motion: no motion.
class ChatInsertMotion extends StatefulWidget {
  const ChatInsertMotion({
    required this.animate,
    required this.mine,
    required this.child,
    super.key,
  });

  /// flutter_chat_ui `insertAnimationDuration` default.
  static const Duration duration = Duration(milliseconds: 250);
  static const Curve curve = Curves.linearToEaseOut;

  /// Read once, when the row is first built.
  final bool animate;
  final bool mine;
  final Widget child;

  @override
  State<ChatInsertMotion> createState() => _ChatInsertMotionState();
}

class _ChatInsertMotionState extends State<ChatInsertMotion>
    with SingleTickerProviderStateMixin {
  AnimationController? _controller;
  Animation<double>? _curved;
  bool _decided = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_decided) return;
    _decided = true;
    if (!widget.animate || context.reduceMotion) return;
    final controller = AnimationController(
      vsync: this,
      duration: ChatInsertMotion.duration,
    );
    _controller = controller;
    _curved = CurvedAnimation(
      parent: controller,
      curve: ChatInsertMotion.curve,
    );
    controller.forward();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final curved = _curved;
    if (curved == null) return widget.child;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final end = widget.mine != rtl;
    return FadeTransition(
      opacity: curved,
      child: SizeTransition(
        sizeFactor: curved,
        child: ScaleTransition(
          scale: curved,
          alignment: end ? Alignment.centerRight : Alignment.centerLeft,
          child: widget.child,
        ),
      ),
    );
  }
}
