import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/navigation/app_routes.dart';

/// Two constants with the same path make go_router open the first screen
/// only; the second never shows. Guards that after the phone-book contacts
/// screen got a path of its own.
void main() {
  test('every static route path in AppRoutes is unique', () {
    final src = File('lib/core/navigation/app_routes.dart').readAsStringSync();
    final re = RegExp(r"static const (\w+) = '(/[^']*)';");
    final byPath = <String, List<String>>{};
    for (final m in re.allMatches(src)) {
      byPath.putIfAbsent(m.group(2)!, () => []).add(m.group(1)!);
    }
    final dup = {
      for (final e in byPath.entries)
        if (e.value.length > 1) e.key: e.value,
    };
    expect(dup, isEmpty);
  });

  test('settings "Contacts" and the phone book are different screens', () {
    expect(AppRoutes.contacts, isNot(AppRoutes.myContacts));
    expect(AppRoutes.contacts, '/profile/settings/phone-contacts');
  });
}
