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
  ///
  /// [status] and [hangup] are the app's own (in-app language) texts;
  /// [avatarUrl] (AN-3) is the other side's photo — the notification shows
  /// it as the person's picture (Android 12+ call style), like WhatsApp.
  Future<void> start({
    required String name,
    int since = 0,
    String status = '',
    String hangup = '',
    String? avatarUrl,
  }) async {
    if (!_supported) return;
    try {
      await _channel.invokeMethod<bool>('start', {
        'name': name,
        'since': since,
        'status': status,
        'hangup': hangup,
        'avatarUrl': avatarUrl ?? '',
      });
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

/// True while the call screen is on top (the "Return to call" bar hides).
class CallScreenVisible extends Notifier<bool> {
  @override
  bool build() => false;

  void set({required bool visible}) {
    // The screen's dispose runs a microtask later, maybe after the scope.
    if (ref.mounted) state = visible;
  }
}

final callScreenVisibleProvider =
    NotifierProvider<CallScreenVisible, bool>(CallScreenVisible.new);

/// Android picture-in-picture for video calls: while on, leaving the app
/// (Home, another app) shrinks the call to a floating window.
class CallPip {
  const CallPip();

  static const _channel = MethodChannel('lawbid/call_pip');

  Future<void> setActive({required bool active}) async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      await _channel.invokeMethod<void>('setActive', {'active': active});
    } on Object {
      // No platform bindings (plain unit tests).
    }
  }
}

final callPipProvider = Provider<CallPip>((ref) => const CallPip());
