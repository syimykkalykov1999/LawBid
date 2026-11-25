import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_controls.dart';
import 'package:lawbid/features/hotline/application/hotline_controller.dart';
import 'package:lawbid/features/hotline/domain/hotline_models.dart';
import 'package:lawbid/features/hotline/presentation/hotline_call_client.dart';
import 'package:lawbid/features/hotline/presentation/hotline_entry_fab.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';
import '../profile/profile_fakes.dart';

/// Owner row 87 (hotline mockup v4): the client's button (C1), the
/// hotline-only call card (C17) and the call bar without a camera.

class _Flags extends FeatureFlagsController {
  _Flags(this._on);
  final bool _on;

  @override
  FeatureFlagsState build() =>
      FeatureFlagsState(flags: {kHotlineFlag: _on}, appConfig: const {});

  void flip({required bool on}) =>
      state = FeatureFlagsState(flags: {kHotlineFlag: on}, appConfig: const {});
}

class _Hotline extends HotlineController {
  _Hotline(this.flow);
  final HotlineFlow flow;

  @override
  HotlineFlow build() => flow;
}

const _cfg = HotlineConfig(enabled: true);

void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('C1 the button appears and goes with the flag, live',
      (tester) async {
    useNarrowPhone(tester);
    final flags = _Flags(false);
    await tester.pumpWidget(
      uxApp(
        const Scaffold(body: Center(child: HotlineEntryFab())),
        theme: AppTheme.light(),
        size: narrowPhone,
        overrides: [
          translatorProvider.overrideWithValue(LongestTranslator()),
          featureFlagsControllerProvider.overrideWith(() => flags),
          currentUserRoleProvider.overrideWithValue(UserRole.client),
          hotlineControllerProvider.overrideWith(
            () => _Hotline(const HotlineFlow(config: _cfg)),
          ),
        ],
      ),
    );
    await tester.pump();
    final fab = find.byKey(const ValueKey('qa-hotline'));
    expect(fab, findsNothing);
    flags.flip(on: true);
    await tester.pump();
    expect(fab, findsOneWidget);
    flags.flip(on: false);
    await tester.pump();
    expect(fab, findsNothing);
  });

  testWidgets('C1 an attorney never sees the client button', (tester) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        const Scaffold(body: Center(child: HotlineEntryFab())),
        theme: AppTheme.light(),
        size: narrowPhone,
        overrides: [
          translatorProvider.overrideWithValue(LongestTranslator()),
          featureFlagsControllerProvider.overrideWith(() => _Flags(true)),
          currentUserRoleProvider.overrideWithValue(UserRole.attorney),
          hotlineControllerProvider.overrideWith(
            () => _Hotline(const HotlineFlow(config: _cfg)),
          ),
        ],
      ),
    );
    await tester.pump();
    expect(find.byKey(const ValueKey('qa-hotline')), findsNothing);
  });

  testWidgets('C17 the hotline call card: who, where, rating, languages',
      (tester) async {
    useNarrowPhone(tester);
    final profile = attorneyProfile(
      username: 'daniel.rivera',
      avatarUrl: 'https://cdn.example.test/a.jpg',
    );
    await tester.pumpWidget(
      uxApp(
        const Scaffold(
          backgroundColor: AppCallColors.stage,
          body: HotlineCallClientPanel(
            peer: CallPeer(
              id: 'att-1',
              isAttorney: true,
              displayName: 'Jane Doe',
              username: 'daniel.rivera',
              avatarUrl: 'https://cdn.example.test/a.jpg',
            ),
            clock: Text('4:12'),
            bottomInset: 0,
          ),
        ),
        theme: AppTheme.light(),
        size: narrowPhone,
        overrides: [
          translatorProvider.overrideWithValue(LongestTranslator()),
          publicAttorneyProfileProvider('daniel.rivera')
              .overrideWith((ref) async => profile),
          hotlineControllerProvider.overrideWith(
            () => _Hotline(
              const HotlineFlow(
                config: _cfg,
                callId: 'call-1',
                draft: HotlineDraft(
                  topic: 'Развод',
                  practice: 'family_law',
                  state: 'NY',
                  languages: ['en'],
                ),
                request: HotlineRequest(
                  id: 'req-1',
                  status: HotlineStatus.connected,
                  callId: 'call-1',
                  lawyer: HotlineLawyer(id: 'att-1', name: 'Jane', state: 'NY'),
                ),
              ),
            ),
          ),
        ],
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('@daniel.rivera'), findsOneWidget);
    expect(find.byKey(const ValueKey('hotline-call-name')), findsOneWidget);
    expect(find.textContaining('›'), findsOneWidget);
    expect(find.text(profile.firmName!), findsOneWidget);
    expect(find.byKey(const ValueKey('hotline-call-photo')), findsOneWidget);
    expect(find.byKey(const ValueKey('hotline-call-profile')), findsOneWidget);
    expect(find.byKey(const ValueKey('hotline-call-offer')), findsOneWidget);
    expect(find.text('4:12'), findsOneWidget);
    expect(tester.takeException(), isNull);
    // let the photo / profile timers run out before the tree goes
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(minutes: 1));
  });

  testWidgets('C17 no camera on a hotline call; 1:1 keeps it', (tester) async {
    useNarrowPhone(tester);
    Widget bar({required bool showVideo}) => uxApp(
          Scaffold(
            body: Center(
              child: CallControlBar(
                speaker: false,
                videoOn: false,
                muted: false,
                showVideo: showVideo,
                onSpeaker: () {},
                onVideo: () {},
                onMute: () {},
                onEnd: () {},
              ),
            ),
          ),
          theme: AppTheme.light(),
          size: narrowPhone,
          overrides: [
            translatorProvider.overrideWithValue(LongestTranslator()),
          ],
        );
    await tester.pumpWidget(bar(showVideo: true));
    expect(find.byKey(const Key('call-btn-video')), findsOneWidget);
    await tester.pumpWidget(bar(showVideo: false));
    await tester.pump();
    expect(find.byKey(const Key('call-btn-video')), findsNothing);
    expect(find.byKey(const Key('call-btn-mute')), findsOneWidget);
    expect(find.byKey(const Key('call-btn-end')), findsOneWidget);
  });
}
