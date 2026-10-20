import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Owner 2026-10-20: the ongoing-call notification (timer, tap → call
/// screen, "Hang up") and the microphone foreground service that keeps the
/// call alive while the app is minimised — Android only (the native side is
/// `CallForegroundService`). iOS keeps its CallKit call, the web has none.
class CallForeground {
  CallForeground() {
    if (!_supported) return;
    try {
      _channel.setMethodCallHandler((call) async {
        if (call.method == 'action' && call.arguments is String) {
          _actions.add(call.arguments as String);
        }
      });
    } on Object {
      // No platform bindings (plain unit tests).
    }
  }

  static const _channel = MethodChannel('lawbid/call_service');
  final _actions = StreamController<String>.broadcast();

  static bool get _supported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  /// `open` (a tap on the notification) and `hangup` (its button).
  Stream<String> get actions => _actions.stream;

  /// A tap that started the app from the notification before Dart was up.
  Future<String?> pendingAction() async {
    if (!_supported) return null;
    try {
      return await _channel.invokeMethod<String>('pendingAction');
    } on Object {
      return null;
    }
  }

  /// Shows / updates the notification; [since] (ms since epoch) starts the
  /// timer, 0 = still connecting.
  Future<void> start({required String name, int since = 0}) async {
    if (!_supported) return;
    try {
      await _channel
          .invokeMethod<bool>('start', {'name': name, 'since': since});
    } on Object catch (e) {
      debugPrint('call service unavailable: $e');
    }
  }

  Future<void> stop() async {
    if (!_supported) return;
    try {
      await _channel.invokeMethod<void>('stop');
    } on Object {
      // Not running.
    }
  }
}

final callForegroundProvider =
    Provider<CallForeground>((ref) => CallForeground());

/// Bumped when something asks for the call screen (the minimised-call bar,
/// the notification, a tap on a chat's call button during a call).
class CallOpenRequest extends Notifier<int> {
  @override
  int build() => 0;

  void bump() => state++;
}

final callOpenRequestProvider =
    NotifierProvider<CallOpenRequest, int>(CallOpenRequest.new);
