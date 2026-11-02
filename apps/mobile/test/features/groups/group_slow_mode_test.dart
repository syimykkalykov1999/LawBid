import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/groups/domain/slow_mode.dart';

/// Owner 2026-11-02: slow-mode labels in the group settings row.
void main() {
  const t = StaticTranslatorEn();

  test('seconds under a minute, minutes rounded up', () {
    expect(slowModeLabel(t, 10), '10 s');
    expect(slowModeLabel(t, 60), '1 min');
    expect(slowModeLabel(t, 900), '15 min');
    expect(slowModeLabel(t, 3600), '60 min');
  });

  test('null and 0 show as off', () {
    expect(slowModeValue(t, null), 'Off');
    expect(slowModeValue(t, 0), 'Off');
    expect(slowModeValue(t, 30), '30 s');
  });
}
