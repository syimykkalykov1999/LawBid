import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-24: the one visible addition of the SFU work. A crowded
/// group call while Cloudflare is down runs audio only; a tap on the video /
/// camera button then shows the app's usual snackbar and the camera stays
/// off. Everything else about the buttons is as it was.
class _Fixed extends CallController {
  _Fixed(this.session);
  final CallSession session;

  @override
  CallSession build() => session;
}

CallSession _crowd({
  required bool blocked,
  bool video = false,
  bool cameraOn = true,
}) =>
    CallSession(
      phase: CallPhase.active,
      connectedAt: DateTime.now(),
      video: video,
      cameraOn: cameraOn,
      call: AppCall(
        id: 'c',
        conversationId: null,
        groupId: 'g',
        status: CallStatus.active,
        outgoing: true,
        peer: const CallPeer(id: 'g', isAttorney: false, displayName: 'Team'),
        createdAt: DateTime.now(),
        group: true,
        hostId: 'u0',
        participants: [
          for (var i = 0; i < 6; i++)
            CallMember(
              userId: 'u$i',
              status: CallMemberStatus.joined,
              displayName: 'P$i',
            ),
        ],
        mediaFallback: CallMediaFallback(
          active: blocked,
          reason: blocked ? 'sfu_unavailable' : null,
          videoBlocked: blocked,
        ),
      ),
    );

Future<void> _pump(WidgetTester tester, CallSession s) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ...uxOverrides(),
        callMyIdProvider.overrideWithValue('u0'),
        callControllerProvider.overrideWith(() => _Fixed(s)),
      ],
      child: MaterialApp(
        theme: AppTheme.of(AppThemeId.values.first),
        home: const CallScreen(),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

final _message = const StaticTranslatorEn().t('call.videoBlocked');

void main() {
  test('the message exists in Russian (the owner text) and English', () {
    expect(
      const StaticTranslatorRu().t('call.videoBlocked'),
      'На сервере идут работы. Видео можно будет включить примерно через час.',
    );
    expect(_message, startsWith('Maintenance is under way'));
  });

  testWidgets('blocked: a tap on the video button says so, no camera',
      (tester) async {
    await _pump(tester, _crowd(blocked: true));
    expect(find.text(_message), findsNothing);
    await tester.tap(find.byKey(const Key('call-btn-video')));
    await tester.pump();
    expect(find.text(_message), findsOneWidget);
    // Nothing else changed: the call goes on, the camera is still off.
    expect(find.byType(CallScreen), findsOneWidget);
  });

  testWidgets(
      'blocked, in a video call with the camera off: a tap on the '
      'camera says so too', (tester) async {
    await _pump(
      tester,
      _crowd(blocked: true, video: true, cameraOn: false),
    );
    await tester.tap(find.byKey(const Key('call-btn-video')));
    await tester.pump();
    expect(find.text(_message), findsOneWidget);
  });

  testWidgets('not blocked: the button works as before, no message',
      (tester) async {
    await _pump(tester, _crowd(blocked: false));
    await tester.tap(find.byKey(const Key('call-btn-video')));
    await tester.pump();
    expect(find.text(_message), findsNothing);
  });
}
