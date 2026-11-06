import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Owner 2026-11-04 (KNOWN_ERRORS №58): on the web `image_picker` hands back
/// a `blob:` URL and `cross_file` reads it with XHR, which `connect-src`
/// governs. Without `blob:` there every photo pick fails on lawbid.dev, while
/// no test sees it (a browser enforces the policy, the tests have none).
void main() {
  test('the web CSP lets the app read picked files', () {
    final tf = File('../../infra/modules/web/main.tf').readAsStringSync();
    final connect = tf
        .split('\n')
        .firstWhere((l) => l.trimLeft().startsWith('"connect-src'));
    expect(connect, contains('"blob:"'));
  });
}
