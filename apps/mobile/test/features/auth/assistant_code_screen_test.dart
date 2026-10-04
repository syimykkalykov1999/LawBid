import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/auth/domain/otp_verify_result.dart';
import 'package:lawbid/features/auth/presentation/screens/assistant_code_screen.dart';

import 'auth_test_harness.dart';

void main() {
  group('AssistantCodeFormatter', () {
    TextEditingValue format(String text) =>
        const AssistantCodeFormatter().formatEditUpdate(
          TextEditingValue.empty,
          TextEditingValue(text: text),
        );

    test('upper-cases, drops junk and adds a dash every 4 symbols', () {
      expect(format('k7qm 4xrt92h9').text, 'K7QM-4XRT-92H9');
      expect(format('abc').text, 'ABC');
      expect(format('ABCD-EFGH-JKMN-PQRS').text, 'ABCD-EFGH-JKMN');
    });

    test('complete only with 12 symbols', () {
      expect(isCompleteAssistantCode('K7QM-4XRT-92H9'), isTrue);
      expect(isCompleteAssistantCode('K7QM-4XRT-92H'), isFalse);
    });
  });

  group('AssistantCodeScreen', () {
    late RecordingAuthRepository repo;

    Future<void> open(WidgetTester tester) async {
      final c = ProviderContainer(overrides: await authOverrides(repo: repo));
      addTearDown(c.dispose);
      final router = GoRouter(
        initialLocation: AuthRoutes.assistant,
        routes: authRoutes(),
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(routedApp(c, router));
      await tester.pumpAndSettle();
      expect(find.byType(AssistantCodeScreen), findsOneWidget);
    }

    testWidgets('sign in stays off until the code is complete, then sends it',
        (tester) async {
      repo = RecordingAuthRepository();
      await open(tester);
      final field = find.byKey(const ValueKey('assistant-code-field'));
      final submit = find.byKey(const ValueKey('assistant-code-submit'));

      await tester.enterText(field, 'k7qm4xrt');
      await tester.pump();
      await tester.tap(submit, warnIfMissed: false);
      await tester.pump();
      expect(repo.assistantCodes, isEmpty);

      await tester.enterText(field, 'k7qm4xrt92h9');
      await tester.pump();
      expect(find.text('K7QM-4XRT-92H9'), findsOneWidget);
      await tester.tap(submit);
      await tester.pump();
      expect(repo.assistantCodes, ['K7QM-4XRT-92H9']);
    });

    testWidgets('a wrong or used code shows the error', (tester) async {
      repo = RecordingAuthRepository(
        verifyResult: const OtpVerifyResult.invalid(),
      );
      await open(tester);
      await tester.enterText(
        find.byKey(const ValueKey('assistant-code-field')),
        'AAAABBBBCCCC',
      );
      await tester.pump();
      await tester.testTextInput.receiveAction(TextInputAction.go);
      await tester.pumpAndSettle();
      expect(repo.assistantCodes, ['AAAA-BBBB-CCCC']);
      expect(
        find.text(
          'This code is not valid or was already used. '
          'Ask your attorney for a new one.',
        ),
        findsOneWidget,
      );
    });
  });
}
