// ignore_for_file: prefer_const_constructors
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/theme/app_theme.dart';
import 'package:lawbid/features/cases/tools/signing_data.dart';
import 'package:lawbid/features/cases/tools/template_form_sheet.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../../helpers/ux_harness.dart';

Future<void> main() async {
  setUpAll(initializeDateFormatting);

  final data = api.CaseFormTemplatesDto(
    prefill: const {'client_name': 'Ann Lee', 'today': '2026-10-20'},
    templates: [
      api.FormTemplateDto(
        id: 't1',
        slug: 'poa',
        title: const {'en': 'Power of attorney'},
        description: const {'en': 'Let the attorney act for you'},
        languages: const ['en', 'ru'],
        fields: [
          api.FormFieldDto(
            key: 'client_name',
            type: api.FormFieldDtoType.text,
            requiredValue: true,
            label: const {'en': 'Client'},
            prefill: api.FormFieldDtoPrefill.clientName,
          ),
          api.FormFieldDto(
            key: 'date',
            type: api.FormFieldDtoType.date,
            requiredValue: true,
            label: const {'en': 'Date'},
            prefill: api.FormFieldDtoPrefill.today,
          ),
          api.FormFieldDto(
            key: 'sum',
            type: api.FormFieldDtoType.number,
            requiredValue: true,
            label: const {'en': 'Amount'},
          ),
        ],
      ),
    ],
  );

  testWidgets('pick, prefilled form, required field is flagged at 360 dp',
      (tester) async {
    await tester.pumpWidget(
      uxApp(
        const Scaffold(body: TemplateSheet(caseId: 'c1')),
        theme: AppTheme.light(),
        size: const Size(360, 800),
        textScale: 1.6,
        overrides: [
          caseFormTemplatesProvider('c1').overrideWith((ref) async => data),
        ],
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Power of attorney'), findsOneWidget);
    await tester.tap(find.text('Power of attorney'));
    await tester.pumpAndSettle();
    expect(find.text('Ann Lee'), findsOneWidget);
    expect(find.text('EN'), findsOneWidget);
    expect(find.text('RU'), findsOneWidget);
    await tester.tap(find.text('Create PDF'));
    await tester.pumpAndSettle();
    expect(find.text('Required'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
