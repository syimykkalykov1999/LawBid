import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_decline_marks.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';

const _peer = CallPeer(id: 'p1', isAttorney: true, displayName: 'Paul Phone');

CallSession _ringing(String id) => CallSession(
      phase: CallPhase.incoming,
      call: AppCall(
        id: id,
        conversationId: 'conv',
        status: CallStatus.ringing,
        outgoing: false,
        peer: _peer,
        createdAt: DateTime(2026, 11, 3),
      ),
    );

/// Owner 2026-11-03 (Android → iPhone): «Отклонить» on the iPhone's CallKit
/// screen (lock screen, banner, app open) ended the call there, but the
/// Samsung caller stayed in it.
///
/// 1. App alive: flutter_callkit_incoming 3.1.6 reports a decline with the
///    data of the LAST VoIP-reported call; the duplicate VoIP push of a call
///    the socket rang first is reported as a throw-away call, so the decline
///    came with the throw-away's id (server: 404).
/// 2. App closed: the VoIP push wakes only the stand-in engine (empty Dart
///    entry, no listener, no session): the decline never left the phone —
///    AppDelegate.onDecline now tells the server natively (the plugin's
///    README flow) with the ring push's ticket.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  group('which call a CallKit decline declined', () {
    test('the ringing call itself: declined', () {
      expect(
        systemDeclineTarget(_ringing('c1'), 'c1', shownIds: const []),
        'c1',
      );
    });

    test(
        'iPhone: the decline came with a throw-away id and the ringing call '
        'left the system screen — the ringing call is the one declined', () {
      expect(
        systemDeclineTarget(
          _ringing('c1'),
          'throwaway-1',
          shownIds: const [],
          platform: TargetPlatform.iOS,
        ),
        'c1',
      );
    });

    test('ids are compared without case (CallKit UUIDs)', () {
      expect(
        systemDeclineTarget(
          _ringing('c1'),
          'throwaway-1',
          shownIds: const ['C1'],
          platform: TargetPlatform.iOS,
        ),
        'throwaway-1',
      );
    });

    test(
        "the throw-away's own end (the ringing call still on screen) "
        'declines nothing that rings', () {
      expect(
        systemDeclineTarget(
          _ringing('c1'),
          'throwaway-1',
          shownIds: const ['c1'],
          platform: TargetPlatform.iOS,
        ),
        'throwaway-1',
      );
    });

    test('cannot tell what is on screen: as before (the event id)', () {
      expect(
        systemDeclineTarget(
          _ringing('c1'),
          'other',
          shownIds: null,
          platform: TargetPlatform.iOS,
        ),
        'other',
      );
    });

    test('Android is unchanged: the event id', () {
      expect(
        systemDeclineTarget(
          _ringing('c1'),
          'other',
          shownIds: const [],
          platform: TargetPlatform.android,
        ),
        'other',
      );
    });

    test('nothing rings here (woken by the VoIP push): the event id', () {
      expect(
        systemDeclineTarget(
          const CallSession(),
          'c9',
          shownIds: null,
          platform: TargetPlatform.iOS,
        ),
        'c9',
      );
    });

    test('our own dismiss is never the user declining', () async {
      await const CallkitSystemUi().dismiss('c2');
      expect(
        systemDeclineTarget(_ringing('c2'), 'c2', shownIds: const []),
        isNull,
      );
      expect(
        systemDeclineTarget(
          _ringing('c2'),
          'throwaway-2',
          shownIds: const [],
          platform: TargetPlatform.iOS,
        ),
        'throwaway-2',
      );
    });
  });

  group('closed iPhone: the native decline (no Dart runs there)', () {
    final swift = File('ios/Runner/AppDelegate.swift').readAsStringSync();
    final onDecline = swift.substring(
      swift.indexOf('func onDecline('),
      swift.indexOf('func onEnd('),
    );

    test('the VoIP ring keeps the ticket for the decline', () {
      expect(swift, contains('"pollToken": (p["pollToken"] as? String)'));
    });

    test(
        'owner 2026-11-08: onDecline tells the server in EVERY app state '
        '(README flow), not only while the stand-in engine runs', () {
      // The bug: a backgrounded / locked app left the decline to Dart,
      // which iOS suspends as soon as the CallKit call ends.
      expect(onDecline, isNot(contains('callkitEngine')));
      expect(swift, contains('/status/decline'));
      expect(onDecline, contains('declineOnServer(call.data, attempt: 1)'));
      expect(onDecline, contains('beginBackgroundTask'));
      // Retried once.
      expect(swift, contains('attempt < 2'));
      // Owner 2026-11-08 (ringtone rang on after «Decline»): fulfilled AT
      // ONCE, the request runs on under a background task.
      expect(
        onDecline.indexOf('action.fulfill()'),
        lessThan(onDecline.indexOf('declineOnServer(call.data')),
      );
      expect(
        onDecline.indexOf(
          'action.fulfill()',
          onDecline.indexOf('declineOnServer('),
        ),
        -1,
      );
    });

    test('a late / repeated ring of a call declined here is not shown again',
        () {
      expect(
        swift,
        contains('if wasEndedByPush(callId) || Self.declinedHere(callId) {'),
      );
    });

    final declineOnServer = swift.substring(
      swift.indexOf('private func declineOnServer('),
      swift.indexOf('func onEnd('),
    );

    test("what is NOT the person's decline is never sent", () {
      // A stop push's own end (caller hung up) is not a decline.
      expect(declineOnServer, contains('!wasEndedByPush(callId)'));
      // An end at or after the ring length is the timeout, not a decline.
      expect(swift, contains('"rangAt": Date().timeIntervalSince1970'));
      expect(declineOnServer, contains('rangFor < Double(data.duration)'));
      // An end the app made itself (Dart marks it first).
      expect(declineOnServer, contains('!Self.endedByApp(callId)'));
      expect(
        swift,
        contains(r'"flutter.call.appEnded.\(callId.lowercased())"'),
      );
      expect('flutter.$appEndedPrefix', 'flutter.call.appEnded.');
    });

    test(
        'a call the socket showed first is declined with the ticket of its '
        'VoIP push (kept by call id)', () {
      expect(
        swift,
        contains('rememberTicket(callId, p["pollToken"] as? String)'),
      );
      expect(
        swift.indexOf('rememberTicket(callId'),
        lessThan(swift.indexOf('let name = (p["callerName"] as? String)')),
      );
      expect(declineOnServer, contains('storedTicket(callId)'));
    });

    test('the decline is remembered for Dart before the request goes', () {
      expect(
        swift,
        contains(r'"flutter.call.declined.\(callId.lowercased())"'),
      );
      expect('flutter.$declinedPrefix', 'flutter.call.declined.');
      expect(
        declineOnServer.indexOf('rememberDeclined(callId)'),
        lessThan(declineOnServer.indexOf('URLRequest(url: url)')),
      );
    });
  });

  group('closed Android: the native decline (CallkitEventCallback)', () {
    const dir = 'android/app/src/main/kotlin/com/lawbid/lawbid';
    final app = File('$dir/LawbidApplication.kt').readAsStringSync();
    final decline = File('$dir/CallDecline.kt').readAsStringSync();
    final receiver = File('$dir/CallPushReceiver.kt').readAsStringSync();
    final manifest =
        File('android/app/src/main/AndroidManifest.xml').readAsStringSync();

    test('the Application registers the plugin callback (README flow)', () {
      expect(manifest, contains('android:name=".LawbidApplication"'));
      expect(
        app,
        contains('FlutterCallkitIncomingPlugin.registerEventCallback('),
      );
      expect(app, contains('CallkitEventCallback.CallEvent.DECLINE'));
      expect(app, contains('CallDecline.onDecline('));
    });

    test('the ring push keeps its ticket; the decline posts it', () {
      expect(receiver, contains('CallDecline.rememberTicket('));
      expect(decline, contains(r'"$api/calls/$callId/status/decline"'));
      expect(decline, contains('put("t", ticket)'));
    });

    test('ends made by the app / the native stop are not declines', () {
      expect(decline, contains('"flutter.$appEndedPrefix"'));
      expect(decline, contains('"flutter.$declinedPrefix"'));
      expect(decline, contains('CallRinging.ENDED_PREFIX + callId'));
      expect(decline, contains('now - ticket.at >= ticket.ringMs'));
    });
  });
}
