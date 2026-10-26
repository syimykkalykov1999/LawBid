import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';

/// Sends [text] to [authorId] as a normal direct message.
typedef StoryReplySender = Future<void> Function(String authorId, String text);

/// Owner 2026-10-20: an answer to a story is an ordinary chat message —
/// the direct chat with the author is opened (or started) and the text
/// goes into it.
final storyReplySenderProvider = Provider<StoryReplySender>(
  (ref) => (authorId, text) async {
    final chat = ref.read(chatRepositoryProvider);
    final conversation = await chat.startDirect(authorId);
    await chat.send(conversation.id, _newClientMessageId(), text);
  },
);

String _newClientMessageId() {
  final random = Random.secure();
  final b = List<int>.generate(16, (_) => random.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  String hex(int from, int to) => b
      .sublist(from, to)
      .map((x) => x.toRadixString(16).padLeft(2, '0'))
      .join();
  return '${hex(0, 4)}-${hex(4, 6)}-${hex(6, 8)}-${hex(8, 10)}-${hex(10, 16)}';
}
