import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Rows 136 / 140 (detective round 1, 13.11): the native fixes on Android
/// and iPhone. There is no Kotlin / Swift test harness in CI, so — as in
/// call_cancel_locked_android_test.dart — the source is checked.
void main() {
  const kt = 'android/app/src/main/kotlin/com/lawbid/lawbid';
  String read(String path) => File(path).readAsStringSync();

  group('Android', () {
    final manifest = read('android/app/src/main/AndroidManifest.xml');

    test('row 136: a chat push in the background starts no Flutter engine', () {
      // The plugin's receiver is replaced by its filtered subclass.
      expect(
        manifest,
        contains(
          'android:name="io.flutter.plugins.firebase.messaging.'
          'FlutterFirebaseMessagingReceiver"\n'
          '            tools:node="remove"',
        ),
      );
      final block = manifest.substring(
        manifest.indexOf('android:name=".FlutterPushReceiver"'),
      );
      expect(
        block.substring(0, block.indexOf('</receiver>')),
        allOf(
          contains('com.google.android.c2dm.permission.SEND'),
          contains('com.google.android.c2dm.intent.RECEIVE'),
        ),
      );
      final receiver = read('$kt/FlutterPushReceiver.kt');
      expect(receiver, contains(': FlutterFirebaseMessagingReceiver()'));
      // What the Dart background handler acts on always reaches it.
      expect(
        receiver,
        contains(
          'setOf("incoming_call", "call_ended", "task_reminder")',
        ),
      );
      expect(receiver, contains('!isApplicationForeground(context)) return'));
    });

    test('D1-17 / D1-20: photos in parallel, short wait, small decode', () {
      final chat = read('$kt/ChatNotifications.kt');
      expect(chat, contains('awaitAll(photos, AVATAR_WAIT_MS)'));
      expect(chat, contains('Executors.newCachedThreadPool()'));
      expect(chat, contains('inJustDecodeBounds = true'));
      expect(chat, contains('catch (e: OutOfMemoryError)'));
      expect(
        chat,
        isNot(contains('BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ')),
      );
      final push = read('$kt/ChatPushReceiver.kt');
      expect(push, isNot(contains('newSingleThreadExecutor')));
      expect(push, contains('catch (e: OutOfMemoryError)'));
    });

    test('D1-19: the ring is asked less often and never past a 429', () {
      final ringing = read('$kt/CallRinging.kt');
      expect(ringing, isNot(contains('POLL_EVERY_MS = 3_000L')));
      expect(ringing, contains('if (code == 429) return REFUSED'));
      expect(ringing, contains('Thread.sleep(pollDelayMs(asked++))'));
    });

    test('D1-21: unchanged phone-book names are not written again', () {
      final chat = read('$kt/ChatNotifications.kt');
      expect(chat, contains('if (p.getString(NAMES, null) == raw) return'));
    });
  });

  group('iPhone', () {
    final swift = read('ios/Runner/AppDelegate.swift');

    test("D1-28: a throw-away report frees the plugin's PushKit call", () {
      final body = swift.substring(
        swift.indexOf('private func reportThenEnd('),
        swift.indexOf('private static let endedKey'),
      );
      expect(body, contains('callkit.endCall(data)'));
      expect(body, isNot(contains('CXEndCallAction')));
    });

    test('D1-29: the media audio session comes back after a call', () {
      expect(swift, contains('data.configureAudioSession = false'));
      final deactivate = swift.substring(
        swift.indexOf('func didDeactivateAudioSession('),
        swift.indexOf('func providerDidReset()'),
      );
      expect(deactivate, contains('restoreMediaAudioSession()'));
    });

    test('D1-30: a reply that did not go says so', () {
      expect(swift, contains('AppDelegate.postReplyFailed(original'));
      expect(swift, contains('(200..<300).contains(status)'));
    });

    test('D1-31: the app and its extension share the App Group', () {
      expect(
        read('ios/Runner/Runner.entitlements'),
        contains(r'<string>group.$(PRODUCT_BUNDLE_IDENTIFIER)</string>'),
      );
      expect(
        read('ios/NotificationService/NotificationService.entitlements'),
        contains(r'<string>$(LAWBID_APP_GROUP)</string>'),
      );
      final xc = read('ios/NotificationService/NotificationService.xcconfig');
      for (final flavor in ['dev', 'staging']) {
        for (final config in ['Debug', 'Profile', 'Release']) {
          expect(
            xc,
            contains(
              'LAWBID_APP_GROUP[config=$config-$flavor] = '
              'group.com.lawbid.lawbid.$flavor',
            ),
          );
        }
      }
      expect(read('ios/Runner/PrivacyInfo.xcprivacy'), contains('1C8F.1'));
    });

    test('D1-32: the scene windows are painted, not the nil app window', () {
      expect(swift, contains('UIScene.willEnterForegroundNotification'));
      expect(swift, isNot(contains('window?.backgroundColor = color')));
    });

    test('D1-33: every permission prompt has Russian and English text', () {
      final plist = read('ios/Runner/Info.plist');
      final keys = RegExp(r'<key>(NS\w+UsageDescription)</key>')
          .allMatches(plist)
          .map((m) => m.group(1)!)
          .toSet();
      expect(keys, isNotEmpty);
      for (final lang in ['ru', 'en']) {
        final strings = read('ios/Runner/$lang.lproj/InfoPlist.strings');
        for (final key in keys) {
          expect(strings, contains('"$key" = '), reason: '$lang: $key');
        }
      }
    });
  });
}
