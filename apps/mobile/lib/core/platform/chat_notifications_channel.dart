import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Owner 2026-10-22 (message pushes like WhatsApp): the phone's own chat
/// notifications — Android draws them natively (MessagingStyle with the
/// sender's photo, one per chat), the iPhone stacks them per chat. Dart only
/// tells the platform:
/// - the names the person saved in the phone book for LawBid contacts (a
///   push from them shows that name; the names never leave the phone);
/// - that a chat was opened (its notification goes away);
/// - a sign-out (no chat of that account stays in the shade);
/// and hears back which chat a tapped notification opens.
/// Web, tests and platforms without the channel: everything is a no-op.
class ChatNotificationsChannel {
  ChatNotificationsChannel({MethodChannel? channel})
      : _channel = channel ?? const MethodChannel('lawbid/chat_notifications');

  final MethodChannel _channel;
  final _opens = StreamController<Map<String, String>>.broadcast();
  bool _listening = false;

  bool get _supported =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  /// A chat notification tapped while the app runs (the push's `data`:
  /// `type`, `conversationId`, `groupId`).
  Stream<Map<String, String>> get opens {
    if (!_listening && _supported) {
      _listening = true;
      _channel.setMethodCallHandler((call) async {
        if (call.method == 'open' && call.arguments is Map) {
          _opens.add(_strings(call.arguments as Map));
        }
      });
    }
    return _opens.stream;
  }

  /// The chat notification the app was started from, once.
  Future<Map<String, String>?> takeLaunchOpen() async {
    if (!_supported) return null;
    try {
      final raw = await _channel.invokeMethod<Map<Object?, Object?>>(
        'pendingOpen',
      );
      return raw == null ? null : _strings(raw);
    } on Object {
      return null;
    }
  }

  /// userId → the name saved in the phone book.
  Future<void> setContactNames(Map<String, String> names) =>
      _call('setContactNames', {'names': names});

  /// The chat is open: its notification is taken away.
  Future<void> clearChat(String conversationId) =>
      _call('clear', {'conversationId': conversationId});

  Future<void> clearAll() => _call('clearAll');

  Future<void> _call(String method, [Object? args]) async {
    if (!_supported) return;
    try {
      await _channel.invokeMethod<void>(method, args);
    } on Object {
      // An older build without the channel: nothing to do.
    }
  }

  static Map<String, String> _strings(Map<Object?, Object?> raw) => {
        for (final e in raw.entries)
          if (e.key is String && e.value is String)
            e.key! as String: e.value! as String,
      };
}

/// One per app: the tap stream is shared.
final chatNotificationsChannel = ChatNotificationsChannel();

/// Phone-book names of LawBid contacts, as the push notifications show
/// them: the saved name of each matched person (blank names skipped).
Map<String, String> contactNamesForPush(
  Iterable<({String userId, String phoneName})> contacts,
) =>
    {
      for (final c in contacts)
        if (c.phoneName.trim().isNotEmpty) c.userId: c.phoneName.trim(),
    };
