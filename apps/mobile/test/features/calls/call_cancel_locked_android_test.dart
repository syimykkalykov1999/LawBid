import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';

/// Owner 2026-10-28: a LOCKED Samsung kept ringing after the caller hung up.
/// The plugin's full-screen ringing activity never got its own «ended»
/// broadcast (addressed to the activity class). Calls variant A: the fix is
/// upstream's PR #872, taken as is in the vendored plugin — no own native
/// stop any more.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('the vendored plugin carries PR #872 (no component on «ended»)', () {
    final kt = File(
      'third_party/flutter_callkit_incoming/android/src/main/kotlin/com/'
      'hiennv/flutter_callkit_incoming/CallkitIncomingActivity.kt',
    ).readAsStringSync();
    final ended = kt.substring(kt.indexOf('fun getIntentEnded'));
    final body = ended.substring(0, ended.indexOf('return intent'));
    expect(body, contains('setPackage(context.packageName)'));
    expect(body, isNot(contains('setClassName')));
  });

  group('a cold start asks the server only once signed in', () {
    test('waits for the session, then goes on', () async {
      String? me;
      final probe = Provider<Ref>((ref) => ref);
      final c = ProviderContainer(
        overrides: [callMyIdProvider.overrideWith((ref) => me)],
      );
      addTearDown(c.dispose);
      final ref = c.read(probe);
      var done = false;
      final wait = whenSignedIn(
        ref,
        step: const Duration(milliseconds: 5),
      ).then((_) => done = true);
      await Future<void>.delayed(const Duration(milliseconds: 30));
      expect(done, isFalse);
      me = 'u1';
      c.invalidate(callMyIdProvider);
      await wait;
      expect(done, isTrue);
    });

    test('gives up after the limit (never hangs the call path)', () async {
      final probe = Provider<Ref>((ref) => ref);
      final c = ProviderContainer(
        overrides: [callMyIdProvider.overrideWithValue(null)],
      );
      addTearDown(c.dispose);
      await whenSignedIn(
        c.read(probe),
        limit: const Duration(milliseconds: 30),
        step: const Duration(milliseconds: 5),
      );
    });
  });
}
