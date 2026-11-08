import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/features/cases/data/cases_repository.dart';
import 'package:lawbid/features/cases/deals/deal_record_data.dart';
import 'package:lawbid/features/cases/deals/pay_block.dart';
import 'package:lawbid/features/cases/deals/rich_terms_editor.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/domain/contingency.dart';
import 'package:lawbid/features/cases/presentation/screens/bid_form_screen.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/onboarding_harness.dart';
import '../profile/profile_fakes.dart';
import 'cases_fakes.dart';

/// Owner 2026-11-07 (prototypes `bid_prototype.html`): ONE «Оплата» block of
/// tiles. Every tile must send the request the two old blocks (fee type +
/// amount, and the detailed terms) would have sent.

const _rules = ContingencyRules(maxBps: 10000, blocked: ['family_law']);

/// What the old bid form built from its two blocks: the fee type picker, the
/// amount field and the detailed-terms editor (a copy of the old inline code).
class _Old {
  _Old(this.fee, this.amountText, this.rich);

  final FeeType fee;
  final String amountText;
  final RichTermsDraft rich;

  bool get _isPercent => fee == FeeType.contingency;
  int? get amountCents => fee == FeeType.freeConsultation || _isPercent
      ? null
      : int.parse(amountText) * 100;
  int? get percentBps => _isPercent ? _rules.parse(amountText) : null;
  Map<String, Object?>? get terms => rich.toDto()?.toJson();
}

Map<String, Object?>? _json(api.PaymentTermsDto? d) => d?.toJson();

class _Placed extends FakeCasesRepository {
  BidInput? placed;
  String practice = 'immigration';

  @override
  Future<CaseBid> placeBid(String caseId, BidInput input) async {
    placed = input;
    return CaseBid(
      id: 'bid-1',
      caseId: caseId,
      attorneyId: 'att-1',
      status: BidStatus.active,
      feeType: input.feeType,
      amountCents: input.amountCents ?? 0,
      message: input.message,
      startAvailability: input.startAvailability,
      startDate: null,
      estimatedDurationDays: null,
      roundCount: 0,
      turn: PartyRole.client,
      createdAt: DateTime(2026, 11, 7),
    );
  }

  @override
  Future<FeedCase> attorneyCase(String caseId) async => FeedCase(
        id: caseId,
        title: 'A case',
        description: 'Text.',
        practice: PracticeRef(
          id: 'leaf-1',
          code: practice,
          i18nKey: 'practice.$practice',
          nameEn: 'Practice',
        ),
        primaryStateCode: 'NJ',
        additionalStateCodes: const [],
        city: null,
        status: CaseStatus.open,
        budget: const CaseBudget(mode: BudgetMode.clarifyLater),
        viewCount: 1,
        bidsCount: 0,
        createdAt: DateTime(2026, 9, 20),
        isNew: false,
        hasOwnBid: false,
      );
}

class _Flags extends FeatureFlagsController {
  @override
  FeatureFlagsState build() => const FeatureFlagsState(
        flags: {...defaultFeatureFlags},
        appConfig: {'fees.contingency_blocked_practices': 'family_law'},
      );

  @override
  Future<void> refreshInBackground({
    String? knownVersion,
    Map<String, bool>? flags,
  }) async {}
}

void main() {
  setUpAll(() async => initializeDateFormatting('en'));

  group('PayDraft builds the request of the old two blocks', () {
    PayDraft draft(PayKind k, void Function(PayDraft d) fill) {
      final d = PayDraft()..select(k);
      fill(d);
      return d;
    }

    void same({
      required PayDraft now,
      required _Old old,
      required bool richOn,
    }) {
      expect(now.feeType, old.fee);
      expect(now.amountCents, old.amountCents);
      expect(now.percentBps(_rules), old.percentBps);
      expect(
        _json(now.terms(richOn: richOn, percentAllowed: true)),
        richOn ? old.terms : isNull,
      );
      expect(now.ok(rules: _rules, richOn: richOn), isTrue);
    }

    for (final richOn in [true, false]) {
      group('rich terms ${richOn ? 'on' : 'off'}', () {
        test('Сумма: fixed + amount (+ terms flat)', () {
          final now = draft(PayKind.flat, (d) => d.rich.flat.text = '3000');
          final rich = RichTermsDraft()
            ..type = api.PaymentTermsDtoType.flat
            ..flat.text = '3000';
          same(
            now: now,
            old: _Old(FeeType.fixed, '3000', rich),
            richOn: richOn,
          );
          expect(now.amountCents, 300000);
        });

        test('Почасово: hourly + rate (+ terms hourly)', () {
          final now = draft(PayKind.hourly, (d) => d.rich.rate.text = '250');
          final rich = RichTermsDraft()
            ..type = api.PaymentTermsDtoType.hourly
            ..rate.text = '250';
          same(
            now: now,
            old: _Old(FeeType.hourly, '250', rich),
            richOn: richOn,
          );
          expect(now.amountCents, 25000);
        });

        test('Процент: contingency + percent (+ terms contingency_pct)', () {
          final now = draft(PayKind.percent, (d) => d.rich.percent.text = '33');
          final rich = RichTermsDraft()
            ..type = api.PaymentTermsDtoType.contingencyPct
            ..percent.text = '33';
          same(
            now: now,
            old: _Old(FeeType.contingency, '33', rich),
            richOn: richOn,
          );
          expect(now.percentBps(_rules), 3300);
          expect(now.amountCents, isNull);
        });

        test('Бесплатно: free consultation, no amount, no terms', () {
          final now = draft(PayKind.free, (_) {});
          expect(now.feeType, FeeType.freeConsultation);
          expect(now.amountCents, isNull);
          expect(now.percentBps(_rules), isNull);
          expect(now.terms(richOn: richOn, percentAllowed: true), isNull);
          expect(now.ok(rules: _rules, richOn: richOn), isTrue);
        });
      });
    }

    test('Рассрочка: fixed, headline = retainer + payment x count', () {
      final now = draft(PayKind.installments, (d) {
        d.rich.retainer.text = '3000';
        d.rich.installment.text = '1000';
        d.rich.count.text = '6';
        d.rich.period = api.PaymentTermsDtoInstallmentPeriod.quarterly;
      });
      final rich = RichTermsDraft()
        ..type = api.PaymentTermsDtoType.retainerPlusInstallments
        ..retainer.text = '3000'
        ..installment.text = '1000'
        ..count.text = '6'
        ..period = api.PaymentTermsDtoInstallmentPeriod.quarterly;
      same(now: now, old: _Old(FeeType.fixed, '9000', rich), richOn: true);
      expect(now.amountCents, 900000);
      expect(
        now.terms(richOn: true, percentAllowed: true)?.installmentPeriod,
        api.PaymentTermsDtoInstallmentPeriod.quarterly,
      );
    });

    test('Рассрочка needs retainer, payment and count', () {
      final d = draft(PayKind.installments, (d) {
        d.rich.retainer.text = '3000';
        d.rich.installment.text = '1000';
      });
      expect(d.ok(rules: _rules, richOn: true), isFalse);
      d.rich.count.text = '6';
      expect(d.ok(rules: _rules, richOn: true), isTrue);
    });

    test('Смешанно with a retainer: fixed headline, percent stays in terms',
        () {
      final now = draft(PayKind.mixed, (d) {
        d.rich.retainer.text = '3000';
        d.rich.percent.text = '20';
      });
      final rich = RichTermsDraft()
        ..type = api.PaymentTermsDtoType.mixed
        ..retainer.text = '3000'
        ..percent.text = '20';
      expect(now.feeType, FeeType.fixed);
      expect(now.amountCents, 300000);
      expect(now.percentBps(_rules), isNull);
      expect(
        _json(now.terms(richOn: true, percentAllowed: true)),
        _Old(FeeType.fixed, '3000', rich).terms,
      );
    });

    test('Смешанно with only a percent: contingency', () {
      final now = draft(PayKind.mixed, (d) => d.rich.percent.text = '20');
      final rich = RichTermsDraft()
        ..type = api.PaymentTermsDtoType.mixed
        ..percent.text = '20';
      expect(now.feeType, FeeType.contingency);
      expect(now.amountCents, isNull);
      expect(now.percentBps(_rules), 2000);
      expect(
        _json(now.terms(richOn: true, percentAllowed: true)),
        _Old(FeeType.contingency, '20', rich).terms,
      );
    });

    test('Смешанно with nothing, or a bad percent, stays grey', () {
      final d = draft(PayKind.mixed, (_) {});
      expect(d.ok(rules: _rules, richOn: true), isFalse);
      d.rich.retainer.text = '100';
      expect(d.ok(rules: _rules, richOn: true), isTrue);
      d.rich.percent.text = '150';
      expect(d.ok(rules: _rules, richOn: true), isFalse);
    });

    // Owner 2026-11-07: nothing of the old editor may be lost. Every field the
    // old editor showed for a type is reachable under the matching tile and
    // goes out exactly as before.
    group('every field of the old editor, tile by tile', () {
      void fillAll(RichTermsDraft r, Set<String> names) {
        final all = <String, TextEditingController>{
          'flat': r.flat,
          'rate': r.rate,
          'hoursMin': r.hoursMin,
          'hoursMax': r.hoursMax,
          'retainer': r.retainer,
          'installment': r.installment,
          'count': r.count,
          'percent': r.percent,
          'notes': r.notes,
        };
        const values = {
          'flat': '3000',
          'rate': '250',
          'hoursMin': '10',
          'hoursMax': '20',
          'retainer': '1000',
          'installment': '500',
          'count': '4',
          'percent': '20',
          'notes': 'Some notes',
        };
        for (final n in names) {
          all[n]!.text = values[n]!;
        }
        r.period = api.PaymentTermsDtoInstallmentPeriod.quarterly;
      }

      final tiles = {
        PayKind.flat: (
          api.PaymentTermsDtoType.flat,
          {'flat', 'notes'},
        ),
        PayKind.hourly: (
          api.PaymentTermsDtoType.hourly,
          {'rate', 'hoursMin', 'hoursMax', 'retainer', 'notes'},
        ),
        PayKind.installments: (
          api.PaymentTermsDtoType.retainerPlusInstallments,
          {'retainer', 'installment', 'count', 'notes'},
        ),
        PayKind.percent: (
          api.PaymentTermsDtoType.contingencyPct,
          {'percent', 'notes'},
        ),
        PayKind.mixed: (
          api.PaymentTermsDtoType.mixed,
          {
            'flat',
            'rate',
            'hoursMin',
            'hoursMax',
            'retainer',
            'installment',
            'count',
            'percent',
            'notes',
          },
        ),
      };
      for (final MapEntry(key: kind, value: (type, names)) in tiles.entries) {
        test('${kind.name}: same terms as the old ${type.name} editor', () {
          final old = RichTermsDraft()..type = type;
          fillAll(old, names);
          final now = PayDraft()..select(kind);
          fillAll(now.rich, names);
          expect(
            _json(now.terms(richOn: true, percentAllowed: true)),
            old.toDto()!.toJson(),
          );
          expect(now.ok(rules: _rules, richOn: true), isTrue);
        });
      }
    });

    test('Почасово with hours and a retainer: hourly + rate, terms as before',
        () {
      final now = draft(PayKind.hourly, (d) {
        d.rich.rate.text = '250';
        d.rich.hoursMin.text = '10';
        d.rich.hoursMax.text = '20';
        d.rich.retainer.text = '1000';
      });
      final rich = RichTermsDraft()
        ..type = api.PaymentTermsDtoType.hourly
        ..rate.text = '250'
        ..hoursMin.text = '10'
        ..hoursMax.text = '20'
        ..retainer.text = '1000';
      same(now: now, old: _Old(FeeType.hourly, '250', rich), richOn: true);
      final terms = now.terms(richOn: true, percentAllowed: true)!;
      expect(terms.estimatedHoursMin, 10);
      expect(terms.estimatedHoursMax, 20);
      expect(terms.retainerCents, 100000);
    });

    test('Почасово: hours from above hours to stays grey', () {
      final d = draft(PayKind.hourly, (d) {
        d.rich.rate.text = '250';
        d.rich.hoursMin.text = '30';
        d.rich.hoursMax.text = '20';
      });
      expect(d.ok(rules: _rules, richOn: true), isFalse);
      d.rich.hoursMax.text = '40';
      expect(d.ok(rules: _rules, richOn: true), isTrue);
    });

    test('Смешанно: hourly alone is hourly; flat + hours + retainer is fixed',
        () {
      final h = draft(PayKind.mixed, (d) => d.rich.rate.text = '250');
      expect(h.feeType, FeeType.hourly);
      expect(h.amountCents, 25000);
      final f = draft(PayKind.mixed, (d) {
        d.rich.flat.text = '2000';
        d.rich.rate.text = '250';
        d.rich.retainer.text = '500';
      });
      expect(f.feeType, FeeType.fixed);
      expect(f.amountCents, 250000);
    });

    test('Сумма keeps the old limits', () {
      final d = draft(PayKind.flat, (d) => d.rich.flat.text = '0');
      expect(d.ok(rules: _rules, richOn: false), isFalse);
      d.rich.flat.text = '10000001';
      expect(
        d.ok(
          rules: _rules,
          richOn: false,
          maxDollars: BidLimits.amountMaxDollars,
        ),
        isFalse,
      );
      d.rich.flat.text = '10000000';
      expect(
        d.ok(
          rules: _rules,
          richOn: false,
          maxDollars: BidLimits.amountMaxDollars,
        ),
        isTrue,
      );
    });

    test('Процент above the admin cap stays grey', () {
      const capped = ContingencyRules(maxBps: 5000, blocked: []);
      final d = draft(PayKind.percent, (d) => d.rich.percent.text = '60');
      expect(d.ok(rules: capped, richOn: false), isFalse);
      d.rich.percent.text = '50';
      expect(d.ok(rules: capped, richOn: false), isTrue);
    });

    test('switching a tile drops what the new tile does not show', () {
      final d = PayDraft()
        ..select(PayKind.installments)
        ..rich.retainer.text = '500'
        ..rich.installment.text = '100'
        ..rich.count.text = '3'
        ..select(PayKind.hourly)
        ..rich.rate.text = '200';
      final terms = d.terms(richOn: true, percentAllowed: true)!;
      expect(terms.type, api.PaymentTermsDtoType.hourly);
      // The retainer is also a field of «Почасово», so it stays; the
      // instalments are not, so they are gone.
      expect(terms.retainerCents, 50000);
      expect(terms.installmentCents, isNull);
      expect(terms.installmentCount, isNull);
      expect(terms.hourlyRateCents, 20000);
    });

    test('an amount carries over between Сумма and Почасово', () {
      final d = PayDraft()
        ..rich.flat.text = '700'
        ..select(PayKind.hourly);
      expect(d.rich.rate.text, '700');
      expect(d.rich.flat.text, isEmpty);
    });

    test('the tiles shown: switch off hides Рассрочка and Смешанно', () {
      expect(
        PayDraft.available(richOn: false, percentAllowed: true),
        [PayKind.flat, PayKind.hourly, PayKind.percent, PayKind.free],
      );
      expect(
        PayDraft.available(richOn: true, percentAllowed: true),
        [
          PayKind.flat,
          PayKind.hourly,
          PayKind.installments,
          PayKind.percent,
          PayKind.mixed,
          PayKind.free,
        ],
      );
      expect(
        PayDraft.available(richOn: true, percentAllowed: false),
        isNot(contains(PayKind.percent)),
      );
    });
  });

  group('bid form', () {
    Finder key(String k) => find.byKey(ValueKey(k));

    Future<_Placed> pump(
      WidgetTester t, {
      bool richOn = true,
      String practice = 'immigration',
    }) async {
      t.view.physicalSize = const Size(390, 2600);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      final repo = _Placed()..practice = practice;
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: attorneyMe(),
        extra: <Override>[
          ...casesOverrides(repo: repo),
          richTermsEnabledProvider.overrideWithValue(richOn),
          featureFlagsControllerProvider.overrideWith(_Flags.new),
        ],
      );
      await t.pumpWidget(wrap(const BidFormScreen(caseId: 'case-1')));
      await t.pump();
      await t.pump(const Duration(milliseconds: 300));
      return repo;
    }

    Future<void> tapTile(WidgetTester t, String name) async {
      await t.ensureVisible(key('pay-tile-$name'));
      await t.tap(key('pay-tile-$name'));
      await t.pump();
      await t.pump(const Duration(milliseconds: 400));
    }

    Future<void> type(WidgetTester t, String field, String text) async {
      await t.enterText(key('pay-field-$field'), text);
      await t.pump();
    }

    Future<void> send(WidgetTester t) async {
      await t.enterText(
        find.byType(EditableText).at(_messageIndex(t)),
        'I handle such cases every week and will take this one.',
      );
      await t.pump();
      await t.ensureVisible(find.byType(GavelStrikeButton));
      await t.tap(find.byType(GavelStrikeButton));
      await t.pump(const Duration(milliseconds: 800));
      await t.pump(const Duration(milliseconds: 800));
    }

    testWidgets('one «Оплата» block with six tiles; «Сумма» is chosen',
        (t) async {
      await pump(t);
      expect(find.text('Payment'), findsOneWidget);
      for (final n in [
        'flat',
        'hourly',
        'installments',
        'percent',
        'mixed',
        'free',
      ]) {
        expect(key('pay-tile-$n'), findsOneWidget, reason: n);
      }
      expect(key('pay-field-amount'), findsOneWidget);
      // The old two blocks are gone.
      expect(find.text('Payment terms (details)'), findsNothing);
      expect(find.text('Fee type'), findsNothing);
      expect(find.text('Later'), findsNothing);
      // Hint of the chosen tile once.
      expect(find.text('One sum for the whole job'), findsOneWidget);
    });

    testWidgets('only the chosen tile shows its fields', (t) async {
      await pump(t);
      await tapTile(t, 'installments');
      expect(key('pay-field-retainer'), findsOneWidget);
      expect(key('pay-field-installment'), findsOneWidget);
      expect(key('pay-field-count'), findsOneWidget);
      expect(key('pay-field-amount'), findsNothing);
      expect(key('pay-field-notes'), findsOneWidget);
      await tapTile(t, 'free');
      expect(key('pay-field-retainer'), findsNothing);
      expect(key('pay-field-notes'), findsNothing);
      expect(find.text('First consultation at no charge'), findsOneWidget);
    });

    testWidgets('a banned topic hides «Процент» and shows the old line',
        (t) async {
      await pump(t, practice: 'family_law');
      await t.pump(const Duration(milliseconds: 300));
      expect(key('pay-tile-percent'), findsNothing);
      expect(key('pay-tile-flat'), findsOneWidget);
      expect(key('pay-tile-mixed'), findsOneWidget);
      // «Смешанно» has no percent field there.
      await tapTile(t, 'mixed');
      expect(key('pay-field-percent'), findsNothing);
    });

    testWidgets('a topic that allows it shows «Процент»', (t) async {
      await pump(t);
      expect(key('pay-tile-percent'), findsOneWidget);
    });

    testWidgets('switch off: only Сумма, Почасово, Процент, Бесплатно',
        (t) async {
      await pump(t, richOn: false);
      expect(key('pay-tile-flat'), findsOneWidget);
      expect(key('pay-tile-hourly'), findsOneWidget);
      expect(key('pay-tile-percent'), findsOneWidget);
      expect(key('pay-tile-free'), findsOneWidget);
      expect(key('pay-tile-installments'), findsNothing);
      expect(key('pay-tile-mixed'), findsNothing);
      expect(key('pay-field-notes'), findsNothing);
    });

    testWidgets('Сумма sends fixed + amount + terms flat', (t) async {
      final repo = await pump(t);
      await type(t, 'amount', '3000');
      await send(t);
      final p = repo.placed!;
      expect(p.feeType, FeeType.fixed);
      expect(p.amountCents, 300000);
      expect(p.percentBps, isNull);
      expect(p.paymentTerms?.type, api.PaymentTermsDtoType.flat);
      expect(p.paymentTerms?.flatCents, 300000);
    });

    testWidgets('Сумма with the switch off sends no terms', (t) async {
      final repo = await pump(t, richOn: false);
      await type(t, 'amount', '3000');
      await send(t);
      expect(repo.placed!.feeType, FeeType.fixed);
      expect(repo.placed!.amountCents, 300000);
      expect(repo.placed!.paymentTerms, isNull);
    });

    testWidgets('Почасово sends hourly + rate + terms hourly', (t) async {
      final repo = await pump(t);
      await tapTile(t, 'hourly');
      await type(t, 'rate', '250');
      await send(t);
      final p = repo.placed!;
      expect(p.feeType, FeeType.hourly);
      expect(p.amountCents, 25000);
      expect(p.paymentTerms?.type, api.PaymentTermsDtoType.hourly);
      expect(p.paymentTerms?.hourlyRateCents, 25000);
    });

    testWidgets('Почасово shows rate, hours from/to and an optional retainer',
        (t) async {
      final repo = await pump(t);
      await tapTile(t, 'hourly');
      expect(key('pay-field-rate'), findsOneWidget);
      expect(key('pay-field-hoursMin'), findsOneWidget);
      expect(key('pay-field-hoursMax'), findsOneWidget);
      expect(find.text(r'Retainer, $ (optional)'), findsOneWidget);
      expect(find.text('Hours from'), findsOneWidget);
      await type(t, 'rate', '250');
      await type(t, 'hoursMin', '10');
      await type(t, 'hoursMax', '20');
      await type(t, 'retainer', '1000');
      await send(t);
      final p = repo.placed!;
      expect(p.feeType, FeeType.hourly);
      expect(p.amountCents, 25000);
      expect(p.paymentTerms?.type, api.PaymentTermsDtoType.hourly);
      expect(p.paymentTerms?.hourlyRateCents, 25000);
      expect(p.paymentTerms?.estimatedHoursMin, 10);
      expect(p.paymentTerms?.estimatedHoursMax, 20);
      expect(p.paymentTerms?.retainerCents, 100000);
    });

    testWidgets('fields show only on their own tiles', (t) async {
      await pump(t);
      expect(key('pay-field-hoursMin'), findsNothing);
      await tapTile(t, 'percent');
      expect(key('pay-field-hoursMin'), findsNothing);
      expect(key('pay-field-retainer'), findsNothing);
      await tapTile(t, 'mixed');
      for (final f in [
        'amount',
        'rate',
        'hoursMin',
        'hoursMax',
        'retainer',
        'installment',
        'count',
        'percent',
        'notes',
      ]) {
        expect(key('pay-field-$f'), findsOneWidget, reason: f);
      }
    });

    testWidgets('Рассрочка sends fixed + terms retainer_plus_installments',
        (t) async {
      final repo = await pump(t);
      await tapTile(t, 'installments');
      await type(t, 'retainer', '2000');
      await type(t, 'installment', '1000');
      await type(t, 'count', '6');
      await send(t);
      final p = repo.placed!;
      expect(p.feeType, FeeType.fixed);
      expect(p.amountCents, 800000);
      expect(
        p.paymentTerms?.type,
        api.PaymentTermsDtoType.retainerPlusInstallments,
      );
      expect(p.paymentTerms?.retainerCents, 200000);
      expect(p.paymentTerms?.installmentCents, 100000);
      expect(p.paymentTerms?.installmentCount, 6);
      expect(
        p.paymentTerms?.installmentPeriod,
        api.PaymentTermsDtoInstallmentPeriod.monthly,
      );
    });

    testWidgets('Процент sends contingency + percent + terms contingency_pct',
        (t) async {
      final repo = await pump(t);
      await tapTile(t, 'percent');
      await type(t, 'percent', '33');
      await send(t);
      final p = repo.placed!;
      expect(p.feeType, FeeType.contingency);
      expect(p.amountCents, isNull);
      expect(p.percentBps, 3300);
      expect(p.paymentTerms?.type, api.PaymentTermsDtoType.contingencyPct);
      expect(p.paymentTerms?.contingencyBps, 3300);
    });

    testWidgets('Смешанно sends fixed headline + terms mixed', (t) async {
      final repo = await pump(t);
      await tapTile(t, 'mixed');
      await type(t, 'retainer', '3000');
      await type(t, 'percent', '20');
      await send(t);
      final p = repo.placed!;
      expect(p.feeType, FeeType.fixed);
      expect(p.amountCents, 300000);
      expect(p.percentBps, isNull);
      expect(p.paymentTerms?.type, api.PaymentTermsDtoType.mixed);
      expect(p.paymentTerms?.retainerCents, 300000);
      expect(p.paymentTerms?.contingencyBps, 2000);
    });

    testWidgets('Бесплатно sends a free consultation and no terms', (t) async {
      final repo = await pump(t);
      await tapTile(t, 'free');
      await send(t);
      final p = repo.placed!;
      expect(p.feeType, FeeType.freeConsultation);
      expect(p.amountCents, isNull);
      expect(p.percentBps, isNull);
      expect(p.paymentTerms, isNull);
    });

    testWidgets('the button stays grey without an amount', (t) async {
      await pump(t);
      final button =
          t.widget<GavelStrikeButton>(find.byType(GavelStrikeButton));
      expect(button.isEnabled, isFalse);
    });
  });
}

int _messageIndex(WidgetTester t) =>
    t.widgetList(find.byType(EditableText)).length - 2;
