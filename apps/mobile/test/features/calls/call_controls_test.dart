import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_controls.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';
import 'package:material_ui/material_ui.dart';

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

/// The admin's switches as the phone last read them; `set` is a fresh
/// read with `video_calls` on or off (owner 18.11).
class _Flags extends FeatureFlagsController {
  @override
  FeatureFlagsState build() => _state(on: false);

  static FeatureFlagsState _state({required bool on}) => FeatureFlagsState(
        flags: {...defaultFeatureFlags, 'video_calls': on},
        appConfig: const {},
      );

  // ignore: use_setters_to_change_properties
  void set({required bool on}) => state = _state(on: on);

  @override
  Future<void> refreshInBackground({
    String? knownVersion,
    Map<String, bool>? flags,
  }) async {}
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

Future<void> _pump(
  WidgetTester tester,
  CallSession s, {
  bool videoCalls = true,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ...uxOverrides(),
        callMyIdProvider.overrideWithValue('u0'),
        // Owner 18.11: the camera button follows the admin's `video_calls`.
        videoCallsEnabledProvider.overrideWithValue(videoCalls),
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

  testWidgets('owner 18.11: video calls off — no camera button, three stay',
      (tester) async {
    await _pump(tester, _active(), videoCalls: false);
    expect(find.byKey(const Key('call-btn-video')), findsNothing);
    final three = [
      for (final k in _bar)
        if (k != 'call-btn-video') k,
    ];
    for (final k in three) {
      expect(find.byKey(Key(k)), findsOneWidget, reason: k);
    }
    // Left to right: Speaker, Mute, End.
    final xs = [
      for (final k in three) tester.getCenter(find.byKey(Key(k))).dx,
    ];
    expect([...xs]..sort(), xs);
  });

  testWidgets('owner 18.11: the button follows the admin switch, live',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          callMyIdProvider.overrideWithValue('u0'),
          featureFlagsControllerProvider.overrideWith(_Flags.new),
          callControllerProvider.overrideWith(() => _Fixed(_active())),
        ],
        child: MaterialApp(
          theme: AppTheme.of(AppThemeId.values.first),
          home: const CallScreen(),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));
    final flags = ProviderScope.containerOf(
      tester.element(find.byType(CallScreen)),
    ).read(featureFlagsControllerProvider.notifier) as _Flags;
    final video = find.byKey(const Key('call-btn-video'));
    // Off in the admin: no camera button.
    expect(video, findsNothing);
    // Switched on: it comes back, in the call that is open.
    flags.set(on: true);
    await tester.pump();
    expect(video, findsOneWidget);
    // Off again: gone again.
    flags.set(on: false);
    await tester.pump();
    expect(video, findsNothing);
    for (final k in ['call-btn-speaker', 'call-btn-mute', 'call-btn-end']) {
      expect(find.byKey(Key(k)), findsOneWidget, reason: k);
    }
  });

  testWidgets('owner 18.11: video calls on — the camera button is there',
      (tester) async {
    await _pump(tester, _active());
    expect(find.byKey(const Key('call-btn-video')), findsOneWidget);
  });

  testWidgets('owner 18.11: video off, our camera still on — it can go off',
      (tester) async {
    await _pump(tester, _active(video: true), videoCalls: false);
    expect(find.byKey(const Key('call-btn-video')), findsOneWidget);
  });

  testWidgets('owner 18.11: video off, only their picture — no camera button',
      (tester) async {
    await _pump(
      tester,
      _active(video: true, cameraOn: false),
      videoCalls: false,
    );
    expect(find.byKey(const Key('call-btn-video')), findsNothing);
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
