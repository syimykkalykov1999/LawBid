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

/// Owner 2026-10-26 (WhatsApp): the in-call buttons on the dark sheet —
/// Speaker · Video · Mute · End; while our camera is on the flip takes the
/// speaker's place; the «turn on yours?» prompt; avatars that never show
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

/// Owner 2026-10-23: the pill read washed out on iPhone (the Blue / Green
/// themes' `danger` is a pale pink). End = solid strong red + white icon in
/// every theme; the other buttons are white icons on a darker fill.
void _barTests() {
  for (final id in AppThemeId.values) {
    testWidgets('call pill: solid red end, visible icons (${id.name})',
        (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: uxOverrides(),
          child: MaterialApp(
            theme: AppTheme.of(id),
            home: Scaffold(
              body: Center(
                child: CallControlBar(
                  speaker: false,
                  videoOn: false,
                  muted: false,
                  onSpeaker: null,
                  onVideo: () {},
                  onMute: () {},
                  onEnd: () {},
                ),
              ),
            ),
          ),
        ),
      );
      Color fillOf(String key) {
        final box = tester.widget<AnimatedContainer>(
          find.descendant(
            of: find.byKey(Key(key)),
            matching: find.byType(AnimatedContainer),
          ),
        );
        return (box.decoration! as BoxDecoration).color!;
      }

      Color iconOf(String key) => tester
          .widget<AppIcon>(
            find.descendant(
              of: find.byKey(Key(key)),
              matching: find.byType(AppIcon),
            ),
          )
          .color!;

      // Owner 2026-10-26 (WhatsApp): the same in every theme — End solid
      // red with a white icon, the others white icons on a light
      // translucent fill.
      expect(fillOf('call-btn-end'), AppCallColors.end);
      expect(iconOf('call-btn-end'), Colors.white);
      for (final k in ['call-btn-speaker', 'call-btn-video', 'call-btn-mute']) {
        expect(iconOf(k), Colors.white, reason: k);
        expect(fillOf(k), Colors.white.withValues(alpha: 0.16), reason: k);
      }
      // A button not available yet (the speaker) is only a little dimmer.
      final dim = tester.widget<Opacity>(
        find
            .descendant(
              of: find.byKey(const Key('call-btn-speaker')),
              matching: find.byType(Opacity),
            )
            .first,
      );
      expect(dim.opacity, greaterThanOrEqualTo(0.7));
    });
  }
}

void main() {
  _barTests();
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

  testWidgets("our camera on: the flip button takes the speaker's place",
      (tester) async {
    await _pump(tester, _active(video: true));
    // Owner 2026-10-26 (WhatsApp video call): Flip · Video · Mute · End.
    for (final k in _bar.skip(1)) {
      expect(find.byKey(Key(k)), findsOneWidget, reason: k);
    }
    expect(find.byKey(const Key('call-btn-speaker')), findsNothing);
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
