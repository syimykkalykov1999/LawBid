import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/core/platform/file_protection.dart';

/// S13 #26: the chat media cache carries iOS Data Protection explicitly.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('lawbid/file_protection');
  final calls = <MethodCall>[];

  setUp(() {
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      return 3;
    });
  });

  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('iOS: the chat media folder and the voice notes are protected',
      () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    final count = await FileProtection.protectChatMedia(
      temporaryDirectory: () async => '/tmp/app',
    );
    expect(count, 3);
    expect(calls.single.method, 'protect');
    expect(calls.single.arguments, {
      'dir': '/tmp/app/${AppImageCaches.chatMediaKey}',
      'prefix': 'voice_cache_',
    });
  });

  test('Android and others: nothing to call', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    expect(await FileProtection.protectChatMedia(), 0);
    expect(calls, isEmpty);
  });

  test('a failing channel never throws', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      channel,
      (_) async => throw PlatformException(code: 'x'),
    );
    expect(
      await FileProtection.protectChatMedia(
        temporaryDirectory: () async => '/tmp/app',
      ),
      0,
    );
  });

  test('the iOS side sets completeUntilFirstUserAuthentication', () {
    final delegate = File('ios/Runner/AppDelegate.swift').readAsStringSync();
    expect(delegate, contains('name: "lawbid/file_protection"'));
    expect(
      delegate,
      contains(
        '.protectionKey: '
        'FileProtectionType.completeUntilFirstUserAuthentication',
      ),
    );
    expect(delegate, contains('registerFileProtection(registrar.messenger())'));
  });
}
