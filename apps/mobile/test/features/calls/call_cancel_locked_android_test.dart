import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owner 2026-10-28: a LOCKED Samsung kept ringing (its call screen stayed
/// up) after the iPhone caller hung up before it was answered; unlocked it
/// stopped. The locked phone's ringing screen is the call plugin's
/// full-screen activity, which the plugin's own «ended» broadcast never
/// reaches (addressed to the activity class). The fix is native
/// (CallRinging.kt / CallPushReceiver.kt): these tests pin the Dart side
/// and the native wiring that has no Kotlin test harness in this repo.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const plugin = MethodChannel('flutter_callkit_incoming');
  const service = MethodChannel('lawbid/call_service');
  late List<MethodCall> pluginCalls;
  late List<MethodCall> serviceCalls;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    forgetRingClaimsForTest();
    pluginCalls = [];
    serviceCalls = [];
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final m = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      ..setMockMethodCallHandler(plugin, (call) async {
        pluginCalls.add(call);
        if (call.method == 'activeCalls') return <Object>[];
        return null;
      })
      ..setMockMethodCallHandler(service, (call) async {
        serviceCalls.add(call);
        return null;
      });
    addTearDown(() {
      m
        ..setMockMethodCallHandler(plugin, null)
        ..setMockMethodCallHandler(service, null);
    });
  });

  tearDown(() => debugDefaultTargetPlatformOverride = null);

  group('a ring that arrives after the call stopped ringing', () {
    test('is not shown (the native stop marked the call)', () async {
      SharedPreferences.setMockInitialValues({
        'call.ended.c1': DateTime.now().millisecondsSinceEpoch,
      });
      await lawbidBackgroundMessage(
        const RemoteMessage(
          data: {'type': 'incoming_call', 'callId': 'c1', 'callerName': 'A'},
        ),
      );
      expect(
        pluginCalls.where((c) => c.method == 'showCallkitIncoming'),
        isEmpty,
      );
    });

    test('another call still rings', () async {
      SharedPreferences.setMockInitialValues({
        'call.ended.c1': DateTime.now().millisecondsSinceEpoch,
      });
      await lawbidBackgroundMessage(
        const RemoteMessage(
          data: {'type': 'incoming_call', 'callId': 'c2', 'callerName': 'A'},
        ),
      );
      expect(
        pluginCalls.where((c) => c.method == 'showCallkitIncoming'),
        hasLength(1),
      );
    });

    test('an old mark (a reused id long after) does not block', () async {
      SharedPreferences.setMockInitialValues({
        'call.ended.c3': DateTime.now()
            .subtract(const Duration(hours: 1))
            .millisecondsSinceEpoch,
      });
      expect(await ringEndedAlready('c3'), isFalse);
    });
  });

  test(
    'ending a call on Android ends its Telecom call and plugin screen',
    () async {
      await const CallkitSystemUi().dismiss('c9');
      expect(pluginCalls.map((c) => c.method), contains('endCall'));
      expect(serviceCalls.single.method, 'endCall');
      expect(serviceCalls.single.arguments, {'id': 'c9'});
    },
  );

  test(
    'iPhone: nothing Android-only is called (CallKit is untouched)',
    () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      await const CallkitSystemUi().dismiss('c10');
      expect(serviceCalls, isEmpty);
    },
  );

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

  group('native wiring (no Kotlin test harness: the source is checked)', () {
    const dir = 'android/app/src/main/kotlin/com/lawbid/lawbid';
    final ringing = File('$dir/CallRinging.kt').readAsStringSync();
    final receiver = File('$dir/CallPushReceiver.kt').readAsStringSync();
    final activity = File('$dir/MainActivity.kt').readAsStringSync();
    final manifest =
        File('android/app/src/main/AndroidManifest.xml').readAsStringSync();

    test('the call push receiver listens to FCM like the chat one', () {
      expect(manifest, contains('android:name=".CallPushReceiver"'));
      final block = manifest.substring(
        manifest.indexOf('android:name=".CallPushReceiver"'),
      );
      expect(
        block.substring(0, block.indexOf('</receiver>')),
        allOf(
          contains('com.google.android.c2dm.permission.SEND'),
          contains('com.google.android.c2dm.intent.RECEIVE'),
        ),
      );
    });

    test('«stop ringing» is native; the end of an answered call is not', () {
      expect(ringing, contains('"call_ended" -> if (data["ended"] == "1")'));
      expect(ringing, contains('"incoming_call" -> PushAction.WATCH'));
      expect(receiver, contains('CallRinging.stop(app, callId)'));
      expect(receiver, contains('CallRinging.onTimeout(context, intent)'));
    });

    test('stop leaves an answered call alone and takes everything else', () {
      final stop = ringing.substring(
        ringing.indexOf('fun stop('),
        ringing.indexOf('fun endAll('),
      );
      expect(stop, contains('if (rec?.isAccepted == true) return'));
      expect(stop, contains('getCallkitSoundPlayerManager()?.stop()'));
      expect(stop, contains('clearIncomingNotification'));
      expect(stop, contains('cancel(callId.hashCode())'));
      expect(stop, contains('CallkitConnection.find(callId)?.markMissed()'));
      expect(stop, contains('removeCall(app, rec)'));
      expect(stop, contains('closeRingingScreen(app)'));
      expect(stop, contains('markEnded(app, callId)'));
    });

    test('the ringing screen is closed by a broadcast it can receive', () {
      final close = ringing.substring(
        ringing.indexOf('fun closeRingingScreen('),
        ringing.indexOf('fun watch('),
      );
      expect(close, contains(r'${context.packageName}.$ACTIVITY_ENDED'));
      expect(
        ringing,
        contains(
          '"com.hiennv.flutter_callkit_incoming.ACTION_ENDED_CALL_INCOMING"',
        ),
      );
      expect(close, contains('setPackage(context.packageName)'));
      // The plugin's own intent names the activity class: never delivered
      // to the activity's runtime receiver. Ours must not.
      expect(close, isNot(contains('setClassName')));
      expect(close, isNot(contains('setComponent')));
    });

    test('the ring is watched with the push ticket and a timeout alarm', () {
      expect(ringing, contains(r'$api/calls/$callId/status?t='));
      expect(ringing, contains('RING_TIMEOUT_MS = 65_000L'));
      expect(ringing, contains('setAndAllowWhileIdle'));
      // No session header from the native side.
      expect(ringing, isNot(contains('Authorization')));
    });

    test('every end leaves no Telecom call, plugin service or PiP window', () {
      final endAll = ringing.substring(
        ringing.indexOf('fun endAll('),
        ringing.indexOf('fun closeRingingScreen('),
      );
      expect(endAll, contains('CallkitConnection.find(id)?.markEnded()'));
      expect(endAll, contains('CallkitNotificationService.stopService(app)'));
      expect(activity, contains('"endCall" ->'));
      expect(activity, contains('leavePictureInPicture()'));
    });
  });
}
