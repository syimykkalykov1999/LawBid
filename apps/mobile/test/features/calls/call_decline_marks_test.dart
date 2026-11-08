import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/application/call_decline_marks.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owner 2026-11-08: the marks shared with the native side (iOS
/// AppDelegate, Android CallDecline) under `flutter.<key>`.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('a decline made here is remembered (lowercase, as the server)',
      () async {
    await markDeclinedHere('ABC-1');
    expect(await declinedHere('abc-1'), isTrue);
    expect(await declinedHere('other'), isFalse);
  });

  test('a decline the native side wrote while the app slept is read', () async {
    final now = DateTime.now().millisecondsSinceEpoch;
    SharedPreferences.setMockInitialValues({
      'call.declined.n1': now - 1000,
      // Older than any ring: forgotten.
      'call.declined.old': now - const Duration(minutes: 6).inMilliseconds,
    });
    expect(await declinedHereIds(), {'n1'});
  });

  test('an end the app makes itself counts for 10 s only', () async {
    await markEndedByApp('E1');
    expect(await endedByApp('e1'), isTrue);
    expect(
      await endedByApp(
        'e1',
        now: DateTime.now().add(const Duration(seconds: 11)),
      ),
      isFalse,
    );
    // A throw-away CallKit call the native side marked (VoIP push with
    // nothing to ring): its «decline» is not sent.
    SharedPreferences.setMockInitialValues({
      'call.appEnded.t1': DateTime.now().millisecondsSinceEpoch,
    });
    expect(await endedByApp('T1'), isTrue);
  });

  test('old marks are cleaned up when a new one is written', () async {
    final old = DateTime.now()
        .subtract(const Duration(hours: 2))
        .millisecondsSinceEpoch;
    SharedPreferences.setMockInitialValues({'call.appEnded.stale': old});
    await markEndedByApp('fresh');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.containsKey('call.appEnded.stale'), isFalse);
    expect(prefs.containsKey('call.appEnded.fresh'), isTrue);
  });
}
