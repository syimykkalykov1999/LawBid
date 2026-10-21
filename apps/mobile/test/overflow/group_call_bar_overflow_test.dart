import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/channels/presentation/channel_widgets.dart'
    show ChannelRow;
import 'package:lawbid/features/groups/application/group_call_port.dart';
import 'package:lawbid/features/groups/domain/ongoing_call.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_call_ui.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_chat_tile.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../features/channels/channels_fakes.dart';
import '../features/groups/fake_group_repository.dart';
import '../helpers/long_locale.dart';
import '../helpers/pending_strings.dart';

/// Owner 2026-10-21 (inbox 20e/20f): the running call of a group / channel —
/// the bar under the header, the people list and the rows of the Groups |
/// Channels lists — every theme, Russian / Nepali / Arabic (right-to-left),
/// 360 dp, text x1 and x1.1. Any overflow fails.
const _longName = 'Maximilian-Alexander Montgomery-Wellington';

GroupRunningCall _running() => GroupRunningCall(
      video: true,
      members: 9,
      people: [
        for (var i = 0; i < 9; i++)
          RunningCallMember(
            userId: 'p$i',
            name: '$_longName $i',
            host: i == 0,
            muted: i.isOdd,
          ),
      ],
      join: (_, __) async => null,
    );

const _summary = OngoingCallSummary(
  id: 'c1',
  video: true,
  count: 9,
  faces: [
    CallFace(userId: 'a', name: _longName),
    CallFace(userId: 'b', name: _longName),
    CallFace(userId: 'c', name: _longName),
  ],
);

void main() {
  setUpAll(initializeDateFormatting);

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
        group('group / channel call: 360 dp, ${theme.name}, $name, x$scale',
            () {
          Future<void> pump(WidgetTester tester, Widget body) async {
            useNarrowPhone(tester);
            await tester.pumpWidget(
              ProviderScope(
                overrides: [translatorProvider.overrideWithValue(t)],
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
                  home: Scaffold(body: body),
                ),
              ),
            );
            await tester.pumpAndSettle();
          }

          testWidgets('the bar and the people list', (tester) async {
            await pump(
              tester,
              Column(
                children: [
                  GroupCallJoinBar(running: _running(), onJoin: () {}),
                ],
              ),
            );
            expect(tester.takeException(), isNull);
            await tester.tap(find.byKey(const ValueKey('group-call-people')));
            await tester.pumpAndSettle();
            expect(
              find.byKey(const ValueKey('running-call-join')),
              findsOneWidget,
            );
            expect(tester.takeException(), isNull);
          });

          testWidgets('the rows of the lists', (tester) async {
            await pump(
              tester,
              ListView(
                children: [
                  GroupChatTile(
                    group: listGroup(
                      'g1',
                      unread: 120,
                      mentions: 1,
                      pinned: true,
                      muted: true,
                      ongoingCall: api.OngoingCallDto(
                        id: 'c1',
                        video: true,
                        participantCount: 9,
                        participants: [
                          for (final n in ['a', 'b', 'c'])
                            api.OngoingCallPersonDto(
                              userId: n,
                              displayName: _longName,
                            ),
                        ],
                        startedAt: DateTime(2026, 10, 21),
                      ),
                    ),
                  ),
                  ChannelRow(
                    channel: fakeChannel(
                      title: _longName * 2,
                      subscribed: true,
                      ongoingCall: _summary,
                    ),
                    onTap: () {},
                  ),
                ],
              ),
            );
            expect(find.byType(OngoingCallLine), findsNWidgets(2));
            expect(tester.takeException(), isNull);
          });
        });
      }
    }
  }
}
