import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
