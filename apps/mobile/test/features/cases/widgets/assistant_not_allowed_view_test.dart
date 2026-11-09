import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';

/// Security audit 2026-11-08 (L2): the server refuses an assistant without
/// the duty (403 ASSISTANT_NOT_ALLOWED). The Mine lists, Saved, case
/// history and bid screens then show a calm notice — not an error with a
/// Retry that can only fail again.
void main() {
  final t = L10nTranslator(
    language: AppLanguage.en,
    cache: const {
      'error.api.ASSISTANT_NOT_ALLOWED':
          'Only the attorney can do this, or another duty is needed.',
      'error.retry': 'Retry',
    },
  );

  Future<void> pump(WidgetTester tester, Object error) => tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: CasesErrorView(error: error, t: t, onRetry: () {}),
          ),
        ),
      );

  testWidgets('assistant without the duty: notice, no Retry', (tester) async {
    await pump(
      tester,
      const ApiException(
        code: ApiErrorCodes.assistantNotAllowed,
        message: 'Only the attorney can do this.',
        statusCode: 403,
      ),
    );
    expect(
      find.text('Only the attorney can do this, or another duty is needed.'),
      findsOneWidget,
    );
    expect(find.text('Retry'), findsNothing);
    expect(find.byType(AppEmptyState), findsOneWidget);
  });

  testWidgets('any other server error keeps its Retry', (tester) async {
    await pump(
      tester,
      const ApiException(code: 'INTERNAL_ERROR', message: 'x', statusCode: 500),
    );
    expect(find.text('Retry'), findsOneWidget);
  });
}
