import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/data/seat_limit_repository.dart';
import 'package:lawbid/features/team/presentation/seat_limit_note.dart';

class _Repo implements SeatLimitRepository {
  _Repo(this.value);

  SeatLimitState value;
  final List<String> calls = [];

  @override
  Future<SeatLimitState> state() async => value;

  @override
  Future<void> request({required int seats, String? note}) async {
    calls.add('request:$seats:${note ?? ''}');
    value = SeatLimitState(
      limit: value.limit,
      isPersonal: false,
      requestStatus: 'pending',
      requestedSeats: seats,
    );
  }
}

void main() {
  const en = StaticTranslatorEn();

  Future<void> pump(WidgetTester tester, _Repo repo) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          translatorProvider.overrideWithValue(en),
          seatLimitRepositoryProvider.overrideWithValue(repo),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const Scaffold(body: SeatLimitNote()),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('default limit, request more → waiting for review',
      (tester) async {
    final repo = _Repo(const SeatLimitState(limit: 10, isPersonal: false));
    await pump(tester, repo);
    expect(
      find.text(en.t('team.limit.default', {'count': '10'})),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const ValueKey('seat-limit-request')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.descendant(
        of: find.byKey(const ValueKey('seat-limit-seats')),
        matching: find.byType(EditableText),
      ),
      '15',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('seat-limit-send')));
    await tester.pumpAndSettle();
    expect(repo.calls, ['request:15:']);
    expect(find.byKey(const ValueKey('seat-limit-status')), findsOneWidget);
    expect(find.byKey(const ValueKey('seat-limit-request')), findsNothing);
  });

  testWidgets('a number at or under the limit cannot be sent', (tester) async {
    final repo = _Repo(const SeatLimitState(limit: 10, isPersonal: false));
    await pump(tester, repo);
    await tester.tap(find.byKey(const ValueKey('seat-limit-request')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.descendant(
        of: find.byKey(const ValueKey('seat-limit-seats')),
        matching: find.byType(EditableText),
      ),
      '8',
    );
    await tester.pump();
    final send = tester.widget<TextButton>(
      find.byKey(const ValueKey('seat-limit-send')),
    );
    expect(send.onPressed, isNull);
  });

  testWidgets('a personal limit from the admin', (tester) async {
    await pump(
      tester,
      _Repo(
        const SeatLimitState(
          limit: 14,
          isPersonal: true,
          requestStatus: 'approved',
          requestedSeats: 15,
        ),
      ),
    );
    expect(
      find.text(en.t('team.limit.personal', {'count': '14'})),
      findsOneWidget,
    );
  });
}
