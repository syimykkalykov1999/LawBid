import 'package:flutter/material.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// PLACEHOLDER (replaced): the poll inside a chat bubble.
class PollBubble extends StatelessWidget {
  const PollBubble({
    required this.groupId,
    required this.message,
    required this.canClose,
    super.key,
  });

  final String groupId;
  final api.GroupMessageDto message;
  final bool canClose;

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
