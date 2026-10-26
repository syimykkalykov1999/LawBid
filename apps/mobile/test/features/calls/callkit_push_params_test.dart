import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';

/// Owner 2026-10-26: «incoming calls arrive without the avatar». The ring
/// push (push-dispatcher.ts dispatchCall) → the system ringing screen:
/// the caller's name, photo link, video flag and call id all reach it.
void main() {
  const photo = 'https://cdn.example.com/avatars/a1_256.jpg';

  group('incomingCallFromPush', () {
    test('reads every key the server sends', () {
      final ring = incomingCallFromPush({
        'type': 'incoming_call',
        'callId': 'call-1',
        'conversationId': 'conv1',
        'callerName': 'Ann Lee',
        'avatarUrl': photo,
        'video': '1',
        'silent': '1',
      });
      expect(ring, isNotNull);
      expect(ring!.callId, 'call-1');
      expect(ring.callerName, 'Ann Lee');
      expect(ring.avatarUrl, photo);
      expect(ring.video, isTrue);
      expect(ring.silent, isTrue);
    });

    test('no photo / no name: none, and the push title as the name', () {
      final ring = incomingCallFromPush({
        'type': 'incoming_call',
        'callId': 'call-2',
        'title': 'Bob',
        'avatarUrl': '',
      });
      expect(ring!.avatarUrl, isNull);
      expect(ring.callerName, 'Bob');
      expect(ring.video, isFalse);
      expect(ring.silent, isFalse);
    });

    test('ignores pushes that are not a ringing call', () {
      expect(
        incomingCallFromPush({'type': 'call_ended', 'callId': 'c'}),
        isNull,
      );
      expect(incomingCallFromPush({'type': 'incoming_call'}), isNull);
      expect(
        incomingCallFromPush({'type': 'incoming_call', 'callId': ''}),
        isNull,
      );
    });
  });

  group('lawbidIncomingParams', () {
    test('Android: name, photo, full screen on the lock screen, audio type',
        () {
      final p = lawbidIncomingParams(
        callId: 'call-1',
        callerName: 'Ann Lee',
        avatarUrl: photo,
        video: true,
        platform: TargetPlatform.android,
      );
      expect(p.id, 'call-1');
      expect(p.nameCaller, 'Ann Lee');
      expect(p.avatar, photo);
      expect(p.type, 0);
      expect(p.extra, {'callId': 'call-1'});
      expect(p.android!.isShowFullLockedScreen, isTrue);
      expect(p.android!.isCustomNotification, isTrue);
      expect(p.android!.ringtonePath, 'system_ringtone_default');
    });

    test('iOS: a video call says so; silent calls use the silent tone', () {
      final p = lawbidIncomingParams(
        callId: 'call-1',
        callerName: 'Ann Lee',
        avatarUrl: photo,
        video: true,
        silent: true,
        platform: TargetPlatform.iOS,
      );
      expect(p.type, 1);
      expect(p.ios!.supportsVideo, isTrue);
      expect(p.android!.ringtonePath, 'silence');
    });

    test('a link that is not a web address is dropped (no broken picture)', () {
      final p = lawbidIncomingParams(
        callId: 'c',
        callerName: 'A',
        avatarUrl: 'avatars/a1.jpg',
        platform: TargetPlatform.android,
      );
      expect(p.avatar, isNull);
    });

    test('push → params: the photo from the push reaches the ringing screen',
        () {
      final ring = incomingCallFromPush({
        'type': 'incoming_call',
        'callId': 'call-9',
        'callerName': 'Ann Lee',
        'avatarUrl': photo,
      })!;
      final p = lawbidIncomingParams(
        callId: ring.callId,
        callerName: ring.callerName,
        avatarUrl: ring.avatarUrl,
        silent: ring.silent,
        video: ring.video,
        platform: TargetPlatform.android,
      );
      expect(p.avatar, photo);
      expect(p.nameCaller, 'Ann Lee');
      expect(p.id, 'call-9');
    });
  });
}
