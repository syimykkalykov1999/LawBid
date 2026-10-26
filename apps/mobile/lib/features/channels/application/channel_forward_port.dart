import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Owner 2026-10-21 (Telegram «Переслать»): «Forward» of a channel post
/// opens the chats' forward sheet — chats, groups, my channels. The feature
/// boundaries keep channels from importing chat, so `run_app.dart` provides
/// it; null (tests, or no chats) hides the item.
typedef ChannelForwardPort = Future<void> Function(
  BuildContext context,
  WidgetRef ref, {
  required String postId,
});

final channelForwardPortProvider = Provider<ChannelForwardPort?>((ref) => null);
