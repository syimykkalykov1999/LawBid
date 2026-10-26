import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_add_panel.dart';
import 'package:lawbid/features/calls/presentation/call_controls.dart';
import 'package:lawbid/features/calls/presentation/call_group.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';
import 'package:lawbid/features/calls/presentation/call_stage.dart';
import 'package:lawbid/shared/people/my_people.dart';

import '../helpers/long_locale.dart';
import '../helpers/long_people.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-20 (group calls): the call screen with three to seven
/// people, the people sheet (host and guest) and the add sheet on a 360 dp
/// phone in the longest translation of every key, the same right-to-left,
/// Nepali, Arabic and Russian — at text scale 1 and 1.1. Any overflow fails.
class _Fixed extends CallController {
  _Fixed(this.session);
  final CallSession session;

  @override
  CallSession build() => session;
}

CallMember _m(
  int i,
  CallMemberStatus st, {
  bool muted = false,
  String? name,
}) =>
    CallMember(
      userId: 'u$i',
      status: st,
      displayName: name ?? 'Participant With A Very Long Name Number $i',
      muted: muted,
      joinedAt:
          st == CallMemberStatus.joined ? DateTime.utc(2026, 10, 20) : null,
    );

CallSession _session(
  int people, {
  bool video = false,
  bool host = true,
  String? notice,
  CallPhase phase = CallPhase.active,
}) {
  final members = [
    for (var i = 0; i < people; i++)
      _m(
        i,
        i == people - 1 ? CallMemberStatus.invited : CallMemberStatus.joined,
        muted: i == 1,
      ),
  ];
  return CallSession(
    phase: phase,
    connectedAt: DateTime.now(),
    video: video,
    notice: notice,
    call: AppCall(
      id: 'c',
      conversationId: 'x',
      status: CallStatus.active,
      outgoing: true,
      peer: const CallPeer(id: 'u1', isAttorney: true, displayName: 'Peer'),
      createdAt: DateTime.now(),
      group: true,
      hostId: host ? 'u0' : 'u1',
      participants: members,
    ),
  );
}

void main() {
  final locales = <String, (Translator, TextDirection)>{
    'longest of all languages': (LongestTranslator(), TextDirection.ltr),
    'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };

  for (final scale in [1.0, 1.1]) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      group('group call: no overflow at 360 dp ($name, text x$scale)', () {
        Future<void> pump(
          WidgetTester tester,
          CallSession s,
          Widget home,
        ) async {
          useNarrowPhone(tester);
          final overrides = <Override>[
            ...uxOverrides(translator: t),
            callMyIdProvider.overrideWithValue('u0'),
            myPeopleProvider.overrideWith((_) async => longPeople()),
            callControllerProvider.overrideWith(() => _Fixed(s)),
          ];
          await tester.pumpWidget(
            ProviderScope(
              overrides: overrides,
              child: MaterialApp(
                debugShowCheckedModeBanner: false,
                theme: AppTheme.dark(),
                builder: (context, child) => Directionality(
                  textDirection: dir,
                  child: MediaQuery(
                    data: MediaQuery.of(context).copyWith(
                      textScaler: TextScaler.linear(scale),
                      disableAnimations: true,
                    ),
                    child: child!,
                  ),
                ),
                home: home,
              ),
            ),
          );
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 500));
        }

        for (final people in [3, 4, 6, 7]) {
          for (final video in [false, true]) {
            testWidgets('call screen, $people people${video ? ', video' : ''}',
                (tester) async {
              await pump(
                tester,
                _session(people, video: video, notice: kNoticeMutedByHost),
                const CallScreen(),
              );
              expect(
                find.byWidgetPredicate(
                  (w) => w is CallGroupGrid || w is CallGroupAudio,
                ),
                findsOneWidget,
              );
              expect(tester.takeException(), isNull);
              await tester.pump(const Duration(seconds: 5));
            });
          }
        }

        testWidgets('video: a tap makes a person big, a tap again goes back',
            (tester) async {
          await pump(tester, _session(6, video: true), const CallScreen());
          String? focus() => ProviderScope.containerOf(
                tester.element(find.byType(CallScreen)),
              ).read(callVideoLayoutProvider).focusId;
          // Owner 2026-10-26 (exactly like WhatsApp): a tap on a tile makes
          // that person big, the others become a strip of live cards.
          await tester.tap(find.byKey(const Key('call-tile-u2')));
          await tester.pump(const Duration(milliseconds: 400));
          expect(focus(), 'u2');
          expect(tester.takeException(), isNull);
          // A tap on a card in the strip makes it the big one.
          await tester.tap(find.byKey(const Key('call-tile-u3')));
          await tester.pump(const Duration(milliseconds: 400));
          expect(focus(), 'u3');
          expect(find.byKey(const Key('call-tile-u2')), findsOneWidget);
          expect(tester.takeException(), isNull);
          // A tap on the big one: back to the grid.
          await tester.tap(find.byKey(const Key('call-tile-u3')));
          await tester.pump(const Duration(milliseconds: 400));
          expect(focus(), isNull);
          expect(tester.takeException(), isNull);
          await tester.pump(const Duration(seconds: 5));
        });

        // Owner 2026-10-22 (Zoom): the «expand» mark on a tile makes that
        // person big; the «turn on yours?» prompt fits with a long name.
        testWidgets('video: a tap on a tile, and the turn-on prompt',
            (tester) async {
          await pump(
            tester,
            _session(6, video: true).copyWith(
              cameraOn: false,
              videoPrompt: 'u2',
            ),
            const CallScreen(),
          );
          expect(find.byType(CallVideoPrompt), findsOneWidget);
          expect(tester.takeException(), isNull);
          await tester.tap(find.byKey(const Key('call-tile-u2')));
          await tester.pump(const Duration(milliseconds: 400));
          expect(
            ProviderScope.containerOf(tester.element(find.byType(CallScreen)))
                .read(callVideoLayoutProvider)
                .focusId,
            'u2',
          );
          expect(tester.takeException(), isNull);
          await tester.pump(const Duration(seconds: 5));
        });

        testWidgets('host presses end while links are still connecting: asked',
            (tester) async {
          await pump(
            tester,
            _session(4, video: true, phase: CallPhase.connecting),
            const CallScreen(),
          );
          await tester.tap(
            find.byWidgetPredicate(
              (w) => w is AppIcon && w.icon == AppIcons.callEndRounded,
            ),
          );
          await tester.pump(const Duration(milliseconds: 400));
          expect(find.byKey(const Key('call-end-for-all')), findsOneWidget);
          await tester.pump(const Duration(seconds: 5));
        });

        for (final host in [true, false]) {
          testWidgets('people sheet (${host ? 'host' : 'guest'})',
              (tester) async {
            await pump(
              tester,
              _session(7, host: host),
              Scaffold(
                body: Builder(
                  builder: (context) => TextButton(
                    onPressed: () => showCallMembersSheet(context),
                    child: const Text('open'),
                  ),
                ),
              ),
            );
            await tester.tap(find.text('open'));
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
          });
        }

        testWidgets('add panel', (tester) async {
          await pump(
            tester,
            _session(3),
            Scaffold(
              body: Builder(
                builder: (context) => TextButton(
                  onPressed: () => showAddToCallPanel(context),
                  child: const Text('open'),
                ),
              ),
            ),
          );
          await tester.tap(find.text('open'));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        });
      });
    }
  }
}
