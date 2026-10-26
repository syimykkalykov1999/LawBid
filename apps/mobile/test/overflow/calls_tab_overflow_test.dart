import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/calls/application/call_history_providers.dart';
import 'package:lawbid/features/calls/data/call_history_repository.dart';
import 'package:lawbid/features/calls/domain/call_history_models.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/contacts_sync/presentation/calls_tab.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-21: «Contacts | Calls» and the Calls tab (running group
/// calls with Join / Return, the history with repeat counters) on a 360 dp
/// phone, text x1 and x1.1, in the longest translation, ne, ru, ar (RTL),
/// de, mr, in all four themes. Nothing may overflow.
const _name = 'Maximilian-Alexander Montgomery-Wellington';

class _History implements CallHistoryRepository {
  @override
  Future<CursorPage<CallHistoryEntry>> history({
    String? cursor,
    int? limit,
  }) async =>
      CursorPage(
        items: [
          for (var i = 0; i < 24; i++)
            CallHistoryEntry(
              id: 'h$i',
              status: i.isEven ? CallStatus.missed : CallStatus.ended,
              outgoing: i % 3 == 0,
              video: i % 4 == 0,
              peer: const CallPeer(
                id: 'u1',
                isAttorney: true,
                displayName: _name,
              ),
              createdAt: DateTime(2026, 10, 21, 10),
              groupId: i % 5 == 0 ? 'g1' : null,
              groupTitle: i % 5 == 0 ? _name : null,
              durationSec: 3725,
            ),
        ],
      );

  @override
  Future<List<OngoingGroupCall>> ongoing() async => const [];

  @override
  Future<void> hide(List<String> ids) async {}

  @override
  Future<void> clear() async {}
}

void main() {
  setUpAll(initializeDateFormatting);
  final locales = <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest rtl': (LongestTranslator(), TextDirection.rtl),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };
  for (final id in AppThemeId.values) {
    for (final scale in [1.0, 1.1]) {
      for (final e in locales.entries) {
        testWidgets('calls tab: ${id.name} ${e.key} x$scale', (t) async {
          useNarrowPhone(t);
          final (tr, dir) = e.value;
          final overrides = <Override>[
            ...uxOverrides(
              translator: tr,
              ongoingCalls: const [
                OngoingGroupCall(
                  id: 'o1',
                  groupId: 'g1',
                  groupTitle: _name,
                  video: true,
                  joined: 128,
                  mine: false,
                ),
                OngoingGroupCall(
                  id: 'o2',
                  groupId: 'g2',
                  groupTitle: _name,
                  video: false,
                  joined: 7,
                  mine: true,
                ),
              ],
            ),
            callHistoryRepositoryProvider.overrideWithValue(_History()),
          ];
          await t.pumpWidget(
            uxApp(
              Directionality(
                textDirection: dir,
                child: Scaffold(
                  body: Column(
                    children: [
                      ContactsCallsSegment(
                        selected: 2,
                        labels: [
                          tr.t('inbox.tab.chats'),
                          tr.t('phoneContacts.title'),
                          tr.t('calls.title'),
                        ],
                        onChanged: (_) {},
                      ),
                      const Expanded(child: CallsTab()),
                    ],
                  ),
                ),
              ),
              theme: AppTheme.of(id),
              size: narrowPhone,
              textScale: scale,
              disableAnimations: true,
              overrides: overrides,
            ),
          );
          await t.pump(const Duration(milliseconds: 600));
          expect(t.takeException(), isNull);
          expect(find.byType(CallHistoryRow), findsWidgets);
          await t.pumpWidget(const SizedBox());
          await t.pump(const Duration(seconds: 30));
        });

        // Owner 2026-10-21 (WhatsApp): picking, its bar and «Clear».
        testWidgets('calls picking + clear: ${id.name} ${e.key} x$scale',
            (t) async {
          useNarrowPhone(t);
          final (tr, dir) = e.value;
          await t.pumpWidget(
            uxApp(
              Directionality(
                textDirection: dir,
                child: Consumer(
                  builder: (context, ref, _) {
                    final picked = ref.watch(callLogSelectionProvider);
                    return Scaffold(
                      appBar: picked != null
                          ? CallLogSelectionBar(picked: picked)
                          : AppTopBar(
                              title: ContactsCallsSegment(
                                selected: 2,
                                labels: [
                                  tr.t('inbox.tab.chats'),
                                  tr.t('phoneContacts.title'),
                                  tr.t('calls.title'),
                                ],
                                onChanged: (_) {},
                              ),
                              actions: const [CallLogMenuButton()],
                            ),
                      body: const CallsTab(),
                    );
                  },
                ),
              ),
              theme: AppTheme.of(id),
              size: narrowPhone,
              textScale: scale,
              disableAnimations: true,
              overrides: [
                ...uxOverrides(translator: tr),
                callHistoryRepositoryProvider.overrideWithValue(_History()),
              ],
            ),
          );
          await t.pump(const Duration(milliseconds: 600));
          await t.longPress(find.byType(CallHistoryRow).first);
          await t.pump();
          await t.tap(find.byKey(const ValueKey('calls-select-all')));
          await t.pump();
          expect(t.takeException(), isNull);
          await t.tap(find.byKey(const ValueKey('calls-select-cancel')));
          await t.pump();
          await t.tap(find.byKey(const ValueKey('calls-menu')));
          await t.pumpAndSettle();
          await t.tap(find.byKey(const ValueKey('calls-menu-clear')));
          await t.pumpAndSettle();
          expect(t.takeException(), isNull);
          expect(find.byKey(const ValueKey('calls-clear-confirm')), findsOne);
          await t.pumpWidget(const SizedBox());
          await t.pump(const Duration(seconds: 30));
        });
      }
    }
  }
}
