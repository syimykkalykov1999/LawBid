import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/theme/app_theme.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/data/cases_repository.dart';
import 'package:lawbid/features/cases/presentation/widgets/private_details_card.dart';

import '../../helpers/ux_harness.dart';

class _Repo extends Fake implements CasesRepository {
  final saved = <String>[];

  @override
  Future<void> setPrivateDetails(String caseId, String text) async {
    saved.add('$caseId:$text');
  }
}

/// Audit 2026-10-19: «Подробности» were shown nowhere and could not be
/// changed once a bid was accepted.
void main() {
  Future<_Repo> pump(
    WidgetTester tester, {
    required bool isOwner,
    String? text,
    VoidCallback? onSaved,
  }) async {
    final repo = _Repo();
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: SingleChildScrollView(
            child: PrivateDetailsCard(
              caseId: 'c1',
              text: text,
              isOwner: isOwner,
              hired: true,
              onSaved: onSaved,
            ),
          ),
        ),
        theme: AppTheme.light(),
        overrides: [casesRepositoryProvider.overrideWithValue(repo)],
      ),
    );
    await tester.pumpAndSettle();
    return repo;
  }

  testWidgets('the owner reads and edits them after hiring', (tester) async {
    var refreshed = 0;
    final repo = await pump(
      tester,
      isOwner: true,
      text: 'Case no. 2026-CV-17',
      onSaved: () => refreshed++,
    );
    expect(find.text('Case no. 2026-CV-17'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('case-private-details-edit')));
    await tester.pumpAndSettle();
    expect(
      find.text(
        'Your attorney sees the change right away and gets a notification.',
      ),
      findsOneWidget,
    );
    await tester.enterText(find.byType(EditableText).last, 'Case no. 18');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('case-private-details-save')));
    await tester.pumpAndSettle();
    expect(repo.saved, ['c1:Case no. 18']);
    expect(refreshed, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the hired attorney reads them; nothing when empty', (
    tester,
  ) async {
    await pump(tester, isOwner: false, text: 'Landlord: J. Smith');
    expect(find.text('Landlord: J. Smith'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('case-private-details-edit')),
      findsNothing,
    );
    await pump(tester, isOwner: false, text: '  ');
    expect(find.byKey(const ValueKey('case-private-details')), findsNothing);
  });
}
