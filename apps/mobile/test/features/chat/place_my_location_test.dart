import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/addresses/current_location.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/presentation/chat_cards.dart';

import '../../helpers/ux_harness.dart';

class _Fixed implements LocationSource {
  _Fixed(this.result);
  final CurrentLocation result;
  @override
  Future<CurrentLocation> current() async => result;
}

Future<String?> _open(WidgetTester tester, CurrentLocation result) async {
  String? sent;
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ...uxOverrides(),
        locationSourceProvider.overrideWithValue(_Fixed(result)),
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: Consumer(
            builder: (context, ref, _) => TextButton(
              onPressed: () async => sent = await askPlaceAddress(context, ref),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('place-mine')));
  await tester.pumpAndSettle();
  return sent;
}

void main() {
  test('the card text is «latitude, longitude» with six digits', () {
    expect(
      const LocationFound(40.7128, -74.006).text,
      '40.712800, -74.006000',
    );
  });

  testWidgets('My location sends the coordinates as the place', (tester) async {
    final sent = await _open(tester, const LocationFound(40.7128, -74.006));
    expect(sent, '40.712800, -74.006000');
  });

  testWidgets('no position: the sheet stays and says so', (tester) async {
    final sent = await _open(tester, const LocationUnavailable());
    expect(sent, isNull);
    expect(find.byKey(const ValueKey('place-mine')), findsOneWidget);
    expect(find.textContaining('location'), findsWidgets);
  });
}
