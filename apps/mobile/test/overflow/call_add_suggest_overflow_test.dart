import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_group.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';
import 'package:lawbid/shared/people/people_suggest_list.dart';

import '../helpers/long_locale.dart';
import '../helpers/pending_strings.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-21 (inbox 25): the call's «Add participant» sheet with
/// live suggestions, a refusal under the field and the full-call notice —
/// every theme, Russian / Nepali / Arabic (right-to-left), 360 dp, text
/// x1 and x1.1. Any overflow fails.
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

Future<List<SuggestedPerson>> _search(String q) async => [
      for (var i = 0; i < 6; i++)
        SuggestedPerson(
          id: 's$i',
          username: 'a_really_long_username_number_$i',
          name: 'Participant With A Very Long Name Number $i',
          verified: i.isEven,
        ),
    ];

void main() {
  final locales = <String, (Translator, TextDirection)>{
    'ru': (
      withPending(
        L10nTranslator(language: AppLanguage.ru, cache: const {}),
        'ru',
      ),
      TextDirection.ltr,
    ),
    'ne': (withPending(ShippedTranslator('ne'), 'ne'), TextDirection.ltr),
    'ar': (withPending(ShippedTranslator('ar'), 'ar'), TextDirection.rtl),
  };

  for (final theme in AppThemeId.values) {
    for (final scale in [1.0, 1.1]) {
      for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
        group('add to call: 360 dp, ${theme.name}, $name, x$scale', () {
          Future<void> open(WidgetTester tester, CallSession s) async {
            useNarrowPhone(tester);
            await tester.pumpWidget(
              ProviderScope(
                overrides: [
                  ...uxOverrides(translator: t),
                  callMyIdProvider.overrideWithValue('u0'),
                  callContactPickerProvider
                      .overrideWithValue((_, __) async => null),
                  callControllerProvider.overrideWith(() => _Fake(s)),
                  peopleSuggestSearchProvider.overrideWithValue(_search),
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
                        onPressed: () => showAddToCallSheet(context),
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

          testWidgets('suggestions, then a refusal under the field',
              (tester) async {
            await open(tester, _session(3));
            await tester.enterText(
              find.byKey(const ValueKey('call-add-field')),
              'participant',
            );
            await tester.pump(peopleSuggestDebounce);
            await tester.pumpAndSettle();
            expect(find.byType(PersonSuggestionTile), findsWidgets);
            expect(tester.takeException(), isNull);
            await tester.tap(find.byKey(const ValueKey('people-suggest-s0')));
            await tester.pumpAndSettle();
            expect(find.text(t.t('call.notAllowedRequest')), findsOneWidget);
            expect(tester.takeException(), isNull);
          });

          testWidgets('full call', (tester) async {
            await open(tester, _session(9));
            expect(find.byKey(const ValueKey('call-add-full')), findsOneWidget);
            expect(tester.takeException(), isNull);
          });
        });
      }
    }
  }
}
