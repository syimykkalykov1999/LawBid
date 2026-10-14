import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/plans/presentation/plan_offer.dart';

Future<void> _show(WidgetTester tester, Object error) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        translatorProvider.overrideWithValue(const StaticTranslatorEn()),
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: Consumer(
            builder: (context, ref, _) => TextButton(
              onPressed: () => showErrorOrPlans(context, ref, error),
              child: const Text('go'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('go'));
  await tester.pump();
}

void main() {
  testWidgets('a plan refusal carries the «Open plans» action', (tester) async {
    await _show(
      tester,
      const ApiException(
        code: ApiErrorCodes.entitlementRequired,
        message: 'no',
      ),
    );
    expect(find.text('Open plans'), findsOneWidget);
  });

  testWidgets('attachments refusal carries it too', (tester) async {
    await _show(
      tester,
      const ApiException(
        code: ApiErrorCodes.postAttachmentsNotAllowed,
        message: 'no',
      ),
    );
    expect(find.text('Open plans'), findsOneWidget);
  });

  testWidgets('another error has no action', (tester) async {
    await _show(
      tester,
      const ApiException(code: ApiErrorCodes.rateLimited, message: 'slow'),
    );
    expect(find.text('Open plans'), findsNothing);
  });
}
