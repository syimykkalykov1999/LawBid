import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/platform/web_gate.dart';

/// Owner 2026-10-15 (web, step 1): the web build stays closed unless it is
/// built with WEB_ENABLED; phones never see the gate.
void main() {
  test('closed by default (no --dart-define=WEB_ENABLED)', () {
    expect(kWebEnabled, isFalse);
  });

  testWidgets('the gate says the web version is coming soon', (tester) async {
    await tester.pumpWidget(const WebGateApp());
    expect(find.textContaining('coming soon'), findsOneWidget);
  });
}
