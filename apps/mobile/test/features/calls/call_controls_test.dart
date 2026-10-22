import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_controls.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-22 (WhatsApp): the in-call buttons — one pill with
/// Speaker · Video · Mute · End; the camera flip in the top bar only while
/// our camera is on; the «turn on yours?» prompt; avatars that never show
/// a broken picture.
class _Fixed extends CallController {
  _Fixed(this.session);
  final CallSession session;

  @override
  CallSession build() => session;
}

CallSession _active({
  bool video = false,
  bool cameraOn = true,
  String? prompt,
}) =>
    CallSession(
      phase: CallPhase.active,
      connectedAt: DateTime.now(),
      video: video,
      cameraOn: cameraOn,
      videoPrompt: prompt,
      call: AppCall(
        id: 'c',
        conversationId: 'x',
        status: CallStatus.active,
        outgoing: true,
        peer: const CallPeer(
          id: 'u1',
          isAttorney: true,
          displayName: 'Paul Phone',
        ),
        createdAt: DateTime.now(),
      ),
    );

Future<void> _pump(WidgetTester tester, CallSession s) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ...uxOverrides(),
        callMyIdProvider.overrideWithValue('u0'),
        callContactPickerProvider.overrideWithValue((_, __) async => null),
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

const _bar = [
  'call-btn-speaker',
  'call-btn-video',
  'call-btn-mute',
  'call-btn-end',
];

void main() {
  testWidgets('a voice call: the pill holds four buttons, no camera flip',
      (tester) async {
    await _pump(tester, _active());
    expect(find.byType(CallControlBar), findsOneWidget);
    for (final k in _bar) {
      expect(find.byKey(Key(k)), findsOneWidget, reason: k);
    }
    // Left to right: Speaker, Video, Mute, End.
    final xs = [
      for (final k in _bar) tester.getCenter(find.byKey(Key(k))).dx,
    ];
    expect([...xs]..sort(), xs);
    expect(find.byKey(const Key('call-btn-flip')), findsNothing);
    // The camera is off: its slashed icon.
    expect(
      find.descendant(
        of: find.byKey(const Key('call-btn-video')),
        matching: find.byIcon(AppIcons.videocamOffOutlined),
      ),
      findsOneWidget,
    );
  });

  testWidgets('our camera on: the flip button comes into the top bar',
      (tester) async {
    await _pump(tester, _active(video: true));
    for (final k in _bar) {
      expect(find.byKey(Key(k)), findsOneWidget, reason: k);
    }
    expect(find.byKey(const Key('call-btn-flip')), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const Key('call-btn-video')),
        matching: find.byIcon(AppIcons.videoCameraOutlined),
      ),
      findsOneWidget,
    );
  });

  testWidgets('their camera on, ours off: no flip, the prompt asks',
      (tester) async {
    await _pump(tester, _active(video: true, cameraOn: false, prompt: 'u1'));
    expect(find.byKey(const Key('call-btn-flip')), findsNothing);
    expect(find.byType(CallVideoPrompt), findsOneWidget);
    expect(find.byKey(const Key('call-video-prompt-on')), findsOneWidget);
    expect(find.byKey(const Key('call-video-prompt-later')), findsOneWidget);
  });

  testWidgets('a photo that cannot load shows the initials, no broken image',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.of(AppThemeId.values.first),
        home: const Scaffold(
          body: Center(
            child: CallAvatar(
              peer: CallPeer(
                id: 'u1',
                isAttorney: false,
                displayName: 'Paul Phone',
                avatarUrl: 'https://invalid.example/nope.jpg',
              ),
              size: 120,
            ),
          ),
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('PP'), findsOneWidget);
    expect(find.byIcon(Icons.broken_image), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
