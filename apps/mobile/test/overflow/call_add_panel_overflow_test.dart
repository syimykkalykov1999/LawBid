import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_add_panel.dart';
import 'package:lawbid/shared/people/my_people.dart';

import '../helpers/long_locale.dart';
import '../helpers/long_people.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-22 (WhatsApp «Add participant»): the call's people panel —
/// sections, «Invite» / «In call» / «Full», a refusal on top, the empty
/// state — in every theme, Russian / Nepali / Arabic (right-to-left) /
/// German / Marathi and the longest text of every key, 360 dp, text x1 and
/// x1.1. Any overflow fails.
class _Fake extends CallController {
  _Fake(this.session);
  final CallSession session;

  @override
  CallSession build() => session;

  @override
  Future<String?> invite({String? userId, String? username}) async =>
      'CALL_NOT_ALLOWED';
}

CallSession _session(int people) => CallSession(
      phase: CallPhase.active,
      connectedAt: DateTime.now(),
      call: AppCall(
        id: 'c',
        conversationId: 'x',
        status: CallStatus.active,
        outgoing: true,
        peer: const CallPeer(id: 'u1', isAttorney: false, displayName: 'P'),
        createdAt: DateTime.now(),
        group: true,
        hostId: 'u0',
        participants: [
          for (var i = 0; i < people; i++)
            CallMember(userId: 'u$i', status: CallMemberStatus.joined),
        ],
      ),
    );

void main() {
  final locales = <String, (Translator, TextDirection)>{
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
    'longest': (LongestTranslator(), TextDirection.ltr),
  };

  for (final theme in AppThemeId.values) {
    for (final scale in [1.0, 1.1]) {
      for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
        group('add-to-call panel: 360 dp, ${theme.name}, $name, x$scale', () {
          Future<void> open(
            WidgetTester tester,
            CallSession s, {
            List<MyPerson>? people,
          }) async {
            useNarrowPhone(tester);
            await tester.pumpWidget(
              ProviderScope(
                overrides: [
                  ...uxOverrides(translator: t),
                  callMyIdProvider.overrideWithValue('u0'),
                  callControllerProvider.overrideWith(() => _Fake(s)),
                  myPeopleProvider
                      .overrideWith((_) async => people ?? longPeople()),
                ],
                child: MaterialApp(
                  debugShowCheckedModeBanner: false,
                  theme: AppTheme.of(theme),
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
                  home: Scaffold(
                    body: Builder(
                      builder: (context) => TextButton(
                        onPressed: () => showAddToCallPanel(context),
                        child: const Text('open'),
                      ),
                    ),
                  ),
                ),
              ),
            );
            await tester.tap(find.text('open'));
            await tester.pumpAndSettle();
          }

          testWidgets('people, then a refusal on top', (tester) async {
            await open(tester, _session(3));
            expect(find.byType(CallAddPanel), findsOneWidget);
            expect(tester.takeException(), isNull);
            await tester.tap(
              find.byKey(const ValueKey('call-add-invite-pcontacts')),
            );
            await tester.pumpAndSettle();
            expect(
              find.byKey(const ValueKey('call-add-error')),
              findsOneWidget,
            );
            expect(tester.takeException(), isNull);
          });

          testWidgets('full call', (tester) async {
            await open(tester, _session(9));
            expect(find.byKey(const ValueKey('call-add-full')), findsOneWidget);
            expect(tester.takeException(), isNull);
          });

          testWidgets('nobody yet', (tester) async {
            await open(tester, _session(3), people: const []);
            expect(
              find.byKey(const ValueKey('call-add-empty')),
              findsOneWidget,
            );
            expect(tester.takeException(), isNull);
          });
        });
      }
    }
  }
}
