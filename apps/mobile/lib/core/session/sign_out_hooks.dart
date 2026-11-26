import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// A server call a feature needs after this device signs out (the session
/// is already cleared, so it gets the old bearer in [extras]).
typedef SignOutServerCall = Future<Object?> Function(
    Dio dio, Map<String, dynamic> extras);

/// Runs on this device BEFORE the session is cleared (local keys of the
/// account go here) and may hand back one server call for afterwards.
typedef SignOutHook = Future<SignOutServerCall?> Function(WidgetRef ref);

/// Sign-out steps owned by features (the dependency points from the
/// feature to core, never from auth to the feature). The app root registers
/// them once (app.dart); `features/auth/application/sign_out.dart` runs them.
abstract final class SignOutHooks {
  static final List<SignOutHook> _hooks = <SignOutHook>[];

  static void register(SignOutHook hook) {
    if (!_hooks.contains(hook)) _hooks.add(hook);
  }

  /// Every hook in order; a failing hook never stops the sign-out.
  static Future<List<SignOutServerCall>> run(WidgetRef ref) async {
    final calls = <SignOutServerCall>[];
    for (final h in List<SignOutHook>.of(_hooks)) {
      try {
        final c = await h(ref);
        if (c != null) calls.add(c);
      } on Object {
        // The local part of a feature failed: sign out anyway.
      }
    }
    return calls;
  }
}
