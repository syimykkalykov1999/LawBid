import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/deals/deal_record_data.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/screens/bid_form_screen.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart';
import 'package:lawbid/features/cases/presentation/widgets/change_bid_sheet.dart';

import '../features/cases/cases_fakes.dart';
import '../helpers/overflow_harness.dart';

/// Owner 2026-11-07: the payment tiles (client budget step, attorney bid
/// form, «Поменять бид») on a 360 dp phone in the longest text of every key,
/// right-to-left, Nepali, German, Marathi, Arabic and Russian, at text scale
/// 1 and 1.3, on every tile. Any overflow fails.
CaseBid _bid() => CaseBid(
      id: 'bid-1',
      caseId: 'c1',
      attorneyId: 'a1',
      status: BidStatus.active,
      feeType: FeeType.fixed,
      amountCents: 60000,
      message: 'Hi',
      startAvailability: StartAvailability.immediately,
      startDate: null,
      estimatedDurationDays: null,
      roundCount: 0,
      turn: PartyRole.attorney,
      createdAt: DateTime(2026, 11, 7),
    );

void main() {
  setUpAll(initializeDateFormatting);

  final locales = overflowLocales();
  const tiles = [
    'flat',
    'hourly',
    'installments',
    'percent',
    'mixed',
    'free',
  ];

  Future<void> tapTile(WidgetTester t, String name) async {
    final f = find.byKey(ValueKey('pay-tile-$name'));
    await t.ensureVisible(f);
    await t.tap(f);
    await t.pump(const Duration(milliseconds: 300));
  }

  for (final scale in overflowScales) {
    for (final MapEntry(key: name, value: (Translator tr, dir))
        in locales.entries) {
      group('payment tiles: no overflow at 360 dp ($name, x$scale)', () {
        testWidgets('client budget step, every tile', (t) async {
          for (final tile in ['later', 'amount', 'percent']) {
            await pumpOverflowApp(
              t,
              Scaffold(
                body: _Budget(),
              ),
              t: tr,
              dir: dir,
              scale: scale,
              client: true,
              act: (t) async {
                await t.pump(const Duration(milliseconds: 300));
                await tapTile(t, tile);
              },
            );
          }
        });

        for (final tile in tiles) {
          testWidgets('bid form, tile $tile', (t) async {
            await pumpOverflowApp(
              t,
              const BidFormScreen(caseId: 'c1'),
              t: tr,
              dir: dir,
              scale: scale,
              extra: <Override>[
                richTermsEnabledProvider.overrideWithValue(true),
              ],
              act: (t) async {
                await t.pump(const Duration(milliseconds: 300));
                await tapTile(t, tile);
              },
            );
          });
        }

        testWidgets('change-bid sheet, tile installments', (t) async {
          await pumpOverflowApp(
            t,
            overflowOpener(
              (context, ref) => showChangeBidSheet(
                context,
                bid: _bid(),
                free: true,
                percentAllowed: true,
              ),
            ),
            t: tr,
            dir: dir,
            scale: scale,
            extra: <Override>[richTermsEnabledProvider.overrideWithValue(true)],
            act: (t) async {
              await t.tap(find.byKey(const Key('open')));
              await t.pump(const Duration(milliseconds: 600));
              await tapTile(t, 'mixed');
              expect(
                find.byKey(const ValueKey('pay-tile-free')),
                findsOneWidget,
              );
            },
          );
        });
      });
    }
  }
}

class _Budget extends StatefulWidget {
  @override
  State<_Budget> createState() => _BudgetState();
}

class _BudgetState extends State<_Budget> {
  var _draft = completeDraft();

  @override
  Widget build(BuildContext context) => BudgetStep(
        draft: _draft,
        onChange: (f) => setState(() => _draft = f(_draft)),
      );
}
