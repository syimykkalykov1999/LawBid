import 'package:flutter/material.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// PLACEHOLDER (replaced): the poll inside a chat bubble.
class PollBubble extends StatelessWidget {
  const PollBubble({
    required this.groupId,
    required this.message,
    required this.canClose,
    this.onPollChanged,
    super.key,
  });

  final String groupId;
  final api.GroupMessageDto message;
  final bool canClose;

  /// Called with the fresh poll after my own vote / close, so the chat
  /// list can keep it.
  final void Function(api.PollDto poll)? onPollChanged;

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
