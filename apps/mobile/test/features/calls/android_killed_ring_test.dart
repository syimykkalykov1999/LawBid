import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owner 2026-11-03 (KNOWN_ERRORS 47): a closed (swiped-away) Android app
/// did not ring. The chain, as documented by firebase_messaging and
/// flutter_callkit_incoming: FCM data push → the top-level
/// `@pragma('vm:entry-point')` background handler → showCallkitIncoming.
/// The break was the build: a prod APK without google-services.json has no
/// Firebase at all. Each link is pinned here.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('prod build carries Firebase', () {
    test('a prod release fails without google-services.json', () {
      final gradle = File('android/app/build.gradle.kts').readAsStringSync();
      expect(gradle, contains('id("com.google.gms.google-services")'));
      expect(gradle, contains('"ProdRelease"'));
      expect(gradle, contains('MissingGoogleServicesStrategy.ERROR'));
      expect(gradle, contains('LAWBID_ALLOW_NO_FIREBASE'));
    });

    test('a Release-prod iPhone build fails without the Firebase plist', () {
      final xcode = File(
        'ios/Runner.xcodeproj/project.pbxproj',
      ).readAsStringSync();
      expect(xcode, contains(r'[ \"$CONFIGURATION\" = \"Release-prod\" ]'));
      expect(xcode, contains('LAWBID_ALLOW_NO_FIREBASE'));
      expect(xcode, contains('exit 1'));
    });

    test('the prod entry point runs the shared start-up (push included)', () {
      final prod = File('lib/main_prod.dart').readAsStringSync();
      expect(prod, contains('runLawBid(AppFlavor.prod)'));
      final push = File(
        'lib/features/notifications/application/push_service.dart',
      ).readAsStringSync();
      expect(
        push,
        contains(
          'FirebaseMessaging.onBackgroundMessage(lawbidBackgroundMessage)',
        ),
      );
    });

    test('the background handler is a top-level vm:entry-point', () {
      final bridge = File('lib/features/calls/application/callkit_bridge.dart')
          .readAsStringSync();
      expect(
        bridge,
        contains(
          "@pragma('vm:entry-point')\n"
          'Future<void> lawbidBackgroundMessage(RemoteMessage message)',
        ),
      );
    });
  });

  group('background handler rings', () {
    const channel = MethodChannel('flutter_callkit_incoming');
    final calls = <MethodCall>[];

    setUp(() {
      calls.clear();
      forgetRingClaimsForTest();
      SharedPreferences.setMockInitialValues({});
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
        calls.add(call);
        return call.method == 'activeCalls' ? <dynamic>[] : true;
      });
    });

    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null);
    });

    test('an incoming_call data push shows the system call screen', () async {
      await lawbidBackgroundMessage(
        const RemoteMessage(
          data: {
            'type': 'incoming_call',
            'callId': 'call-k1',
            'callerName': 'Ann Lee',
            'ringSeconds': '60',
          },
        ),
      );
      final show = calls.where((c) => c.method == 'showCallkitIncoming');
      expect(show, hasLength(1));
      final args = Map<String, dynamic>.from(show.single.arguments as Map);
      expect(args['id'], 'call-k1');
      expect(args['nameCaller'], 'Ann Lee');
      expect(args['duration'], 60000);
      expect(args['extra'], {'callId': 'call-k1'});
    });

    test('a push that is not a call shows nothing', () async {
      await lawbidBackgroundMessage(
        const RemoteMessage(data: {'type': 'new_message', 'callId': 'x'}),
      );
      expect(calls.where((c) => c.method == 'showCallkitIncoming'), isEmpty);
    });
  });
}
