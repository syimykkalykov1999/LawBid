import 'package:shared_preferences/shared_preferences.dart';

/// Owner 2026-11-08 (iPhone «Decline» on the locked CallKit screen: the
/// caller rang on, and the chat's call button then took the iPhone back
/// into that same old call). Two small marks in the shared preferences,
/// read and written by the phone's native side too (shared_preferences
/// keeps them under `flutter.<key>`: UserDefaults on iOS, the
/// `FlutterSharedPreferences` file on Android).
///
/// - [appEndedPrefix]: the app itself is about to end this ringing system
///   call (answered elsewhere, its own ring timer, the in-app Decline that
///   tells the server itself). flutter_callkit_incoming reports such an end
///   as a «decline» too; the native decline (iOS AppDelegate.onDecline,
///   Android LawbidApplication) skips it.
/// - [declinedPrefix]: the person declined this call on this phone. The
///   app never rings it again (the socket's late `call:incoming`, a push
///   or the start-up scan) and tells the server once more instead.
const appEndedPrefix = 'call.appEnded.';
const declinedPrefix = 'call.declined.';

/// How long a decline is remembered: longer than any ring.
const kDeclinedMemory = Duration(minutes: 5);

String _key(String prefix, String callId) => '$prefix${callId.toLowerCase()}';

/// Marks [callId] as ended by the app — awaited BEFORE the system call is
/// ended, so the native side reads it when the plugin reports the end.
Future<void> markEndedByApp(String callId) => _write(appEndedPrefix, callId);

/// The person declined [callId] here (read again by [declinedHereIds],
/// also in another isolate or after a restart).
Future<void> markDeclinedHere(String callId) => _write(declinedPrefix, callId);

/// The calls declined on this phone within [kDeclinedMemory] — by the app
/// or natively while it slept (iOS AppDelegate, Android CallDecline).
Future<Set<String>> declinedHereIds({DateTime? now}) async {
  final ids = <String>{};
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.reload();
    final t = (now ?? DateTime.now()).millisecondsSinceEpoch;
    for (final k in prefs.getKeys()) {
      if (!k.startsWith(declinedPrefix)) continue;
      final at = prefs.get(k);
      if (at is int && t - at < kDeclinedMemory.inMilliseconds) {
        ids.add(k.substring(declinedPrefix.length));
      }
    }
  } on Object {
    // No preferences (tests, desktop): nothing remembered.
  }
  return ids;
}

/// Whether the app (Dart, or the native side for a throw-away CallKit call
/// of a VoIP push with nothing to ring) ended [callId] itself just now.
Future<bool> endedByApp(String callId, {DateTime? now}) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.reload();
    final at = prefs.get(_key(appEndedPrefix, callId));
    return at is int &&
        (now ?? DateTime.now()).millisecondsSinceEpoch - at <
            const Duration(seconds: 10).inMilliseconds;
  } on Object {
    return false;
  }
}

/// Whether [callId] was declined on this phone (see [declinedHereIds]).
Future<bool> declinedHere(String callId) async =>
    (await declinedHereIds()).contains(callId.toLowerCase());

Future<void> _write(String prefix, String callId) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final now = DateTime.now().millisecondsSinceEpoch;
    // Old marks go: they only matter for a few minutes.
    for (final k in prefs.getKeys().toList()) {
      if (!k.startsWith(prefix)) continue;
      final at = prefs.get(k);
      if (at is! int || now - at > const Duration(hours: 1).inMilliseconds) {
        await prefs.remove(k);
      }
    }
    await prefs.setInt(_key(prefix, callId), now);
  } on Object {
    // No preferences here (tests, desktop).
  }
}
