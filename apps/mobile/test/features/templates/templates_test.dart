import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/client_plan/client_plan_routes.dart';
import 'package:lawbid/features/plans/presentation/plan_offer.dart';
import 'package:lawbid/features/subscription/presentation/paywall_screen.dart';
import 'package:lawbid/features/templates/application/templates_providers.dart';
import 'package:lawbid/features/templates/data/templates_repository.dart';
import 'package:lawbid/features/templates/domain/doc_template.dart';
import 'package:lawbid/features/templates/presentation/templates_screen.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-05: the document templates library — search, state,
/// popular / new; a template opens Download / Share; picked from a chat
/// or a case file it is returned to the caller.

const _lease = DocTemplate(
  id: 't1',
  title: 'Residential lease agreement for Illinois apartments and houses '
      '(month-to-month or fixed term)',
  description: 'Fill in the names, the address, rent and the deposit. '
      'Both sides sign every page.',
  fileName: 'Residential lease.pdf',
  mime: 'application/pdf',
  sizeBytes: 182000,
  language: 'en',
  lawyersOnly: false,
  downloadCount: 42,
  state: 'IL',
);

const _lockedLease = DocTemplate(
  id: 't3',
  title: 'Residential lease agreement for Illinois apartments and houses '
      '(month-to-month or fixed term)',
  description: 'Fill in the names, the address, rent and the deposit.',
  fileName: 'Residential lease.pdf',
  mime: 'application/pdf',
  sizeBytes: 182000,
  language: 'en',
  lawyersOnly: false,
  downloadCount: 42,
  locked: true,
);

const _retainer = DocTemplate(
  id: 't2',
  title: 'Retainer agreement',
  description: '',
  fileName: 'Retainer.docx',
  mime:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  sizeBytes: 24000,
  language: 'en',
  lawyersOnly: true,
  downloadCount: 0,
);

class _Repo extends TemplatesRepository {
  _Repo(this.items) : super(apiDio: Dio(), storageDio: Dio());

  final List<DocTemplate> items;
  final queries = <TemplatesQuery>[];

  @override
  Future<CursorPage<DocTemplate>> list(
    TemplatesQuery q, {
    String? cursor,
  }) async {
    queries.add(q);
    return CursorPage(
      items: [
        for (final i in items)
          if (q.q.isEmpty || i.title.toLowerCase().contains(q.q.toLowerCase()))
            i,
      ],
    );
  }
}

void main() {
  setUpAll(initializeDateFormatting);

  late List<Override> base;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    base = [
      sharedPreferencesProvider.overrideWithValue(prefs),
      referralOffOverride,
      promotionsOffOverride,
    ];
  });

  Future<_Repo> pump(
    WidgetTester tester,
    Widget child, {
    List<DocTemplate> items = const [_lease, _retainer],
    Translator t = const StaticTranslatorRu(),
    TextDirection dir = TextDirection.ltr,
  }) async {
    final repo = _Repo(items);
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        Directionality(textDirection: dir, child: child),
        theme: AppTheme.light(),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(
          translator: t,
          extra: [
            ...base,
            templatesRepositoryProvider.overrideWithValue(repo),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    return repo;
  }

  testWidgets('lists templates with type, size, state and "For attorneys"',
      (tester) async {
    final repo = await pump(tester, const TemplatesScreen());
    expect(find.text('Шаблоны документов'), findsOneWidget);
    expect(find.byType(TemplateCard), findsNWidgets(2));
    expect(find.textContaining('PDF · 178 KB · IL'), findsOneWidget);
    expect(find.text('Для адвокатов'), findsOneWidget);
    expect(repo.queries.last, const TemplatesQuery());

    await tester.tap(find.text('Новые'));
    await tester.pump();
    expect(repo.queries.last.newest, isTrue);

    await tester.enterText(find.byType(TextField), 'retainer');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
    expect(find.byType(TemplateCard), findsOneWidget);
    expect(find.text('Retainer agreement'), findsOneWidget);
  });

  testWidgets('a template opens Download / Share with the disclaimer',
      (tester) async {
    await pump(tester, const TemplatesScreen());
    await tester.tap(find.byType(TemplateCard).first);
    await tester.pumpAndSettle();
    expect(find.byType(TemplateSheet), findsOneWidget);
    expect(find.text('Скачать'), findsOneWidget);
    expect(find.text('Поделиться'), findsOneWidget);
    expect(find.textContaining('не юридическая консультация'), findsOneWidget);
    expect(find.textContaining('Скачиваний: 42'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('picker mode returns the tapped template', (tester) async {
    DocTemplate? picked;
    await pump(
      tester,
      Builder(
        builder: (context) => Center(
          child: TextButton(
            onPressed: () async => picked = await pickTemplate(context),
            child: const Text('open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('Выберите шаблон'), findsOneWidget);
    await tester.tap(find.text('Retainer agreement'));
    await tester.pumpAndSettle();
    expect(picked?.id, 't2');
  });

  testWidgets(
      'a template outside the plan shows a lock and offers the plans '
      'instead of Download', (tester) async {
    await pump(tester, const TemplatesScreen(), items: const [_lockedLease]);
    expect(
      find.bySemanticsLabel(RegExp('Входит в платный план')),
      findsOneWidget,
    );
    await tester.tap(find.byType(TemplateCard));
    await tester.pumpAndSettle();
    expect(find.text('Посмотреть планы'), findsOneWidget);
    expect(find.text('Скачать'), findsNothing);
    expect(find.text('Поделиться'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  test('plans open where the role buys them', () {
    expect(
      planOfferPath(UserRole.client, PaywallReason.templates),
      ClientPlanRoutes.clientPlan,
    );
    expect(
      planOfferPath(UserRole.attorney, PaywallReason.videoCall),
      AppRoutes.subscriptionRequiredFor('videoCall'),
    );
    expect(
      planOfferPath(UserRole.assistant, PaywallReason.templates),
      AppRoutes.subscriptionRequiredFor('templates'),
    );
    expect(PaywallReason.parse('videoCall'), PaywallReason.videoCall);
  });

  testWidgets('nothing found shows the empty state', (tester) async {
    await pump(tester, const TemplatesScreen(), items: const []);
    expect(find.text('Шаблонов нет'), findsOneWidget);
  });

  final locales = <String, (Translator, TextDirection)>{
    'longest of all languages': (LongestTranslator(), TextDirection.ltr),
    'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };
  for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
    group('no overflow at 360 dp ($name)', () {
      testWidgets('the list', (tester) async {
        await pump(tester, const TemplatesScreen(), t: t, dir: dir);
        expect(tester.takeException(), isNull);
      });

      testWidgets('the template sheet', (tester) async {
        await pump(tester, const TemplatesScreen(), t: t, dir: dir);
        await tester.tap(find.byType(TemplateCard).first);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });

      testWidgets('a locked template and its sheet', (tester) async {
        await pump(
          tester,
          const TemplatesScreen(),
          items: const [_lockedLease],
          t: t,
          dir: dir,
        );
        expect(tester.takeException(), isNull);
        await tester.tap(find.byType(TemplateCard));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    });
  }
}
