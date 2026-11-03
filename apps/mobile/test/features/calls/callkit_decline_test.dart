import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
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
        'onDecline tells the server before fulfilling, only while the '
        'stand-in engine runs (the app engine declines from Dart)', () {
      expect(onDecline, contains('guard callkitEngine != nil else'));
      expect(onDecline, contains('/status/decline'));
      expect(onDecline, contains('declineOnServer(call.data, attempt: 1)'));
      expect(onDecline, contains('beginBackgroundTask'));
      // Fulfilled in the request's completion (README flow), retried once.
      expect(onDecline, contains('attempt < 2'));
      expect(
        onDecline.indexOf(
          'action.fulfill()',
          onDecline.indexOf('declineOnServer(call.data'),
        ),
        greaterThan(0),
      );
      // A stop push's own end (caller hung up) is not a decline.
      expect(onDecline, contains('!wasEndedByPush(callId)'));
    });
  });
}
