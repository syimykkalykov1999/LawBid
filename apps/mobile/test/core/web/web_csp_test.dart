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

  // Holes re-check (25.11, item 13): App Check on the web is reCAPTCHA
  // Enterprise (core/security/app_check.dart). Google's documented CSP for
  // reCAPTCHA: script-src www.google.com/recaptcha/ + www.gstatic.com/
  // recaptcha/, frame-src www.google.com/recaptcha/ +
  // recaptcha.google.com/recaptcha/; Firebase App Check exchanges the
  // reCAPTCHA answer at content-firebaseappcheck.googleapis.com. Without
  // them the browser blocks the script and the token call: no token ever.
  test('the web CSP lets App Check (reCAPTCHA Enterprise) get a token', () {
    final tf = File('../../infra/modules/web/main.tf').readAsStringSync();
    String line(String start) =>
        tf.split('\n').firstWhere((l) => l.trimLeft().startsWith(start));
    List<String> local(String name) {
      final m = RegExp('$name\\s*=\\s*\\[([^\\]]*)\\]').firstMatch(tf);
      expect(m, isNotNull, reason: name);
      return RegExp('"([^"]+)"')
          .allMatches(m!.group(1)!)
          .map((x) => x.group(1)!)
          .toList();
    }

    expect(local('recaptcha_script_src'), [
      'https://www.google.com/recaptcha/',
    ]);
    expect(local('recaptcha_frame_src'), [
      'https://www.google.com/recaptcha/',
      'https://recaptcha.google.com/recaptcha/',
    ]);
    expect(local('app_check_connect'), [
      'https://content-firebaseappcheck.googleapis.com',
    ]);
    final script = line('script_src');
    expect(script, contains('local.recaptcha_script_src'));
    // www.gstatic.com/recaptcha/ is covered by the whole gstatic origin
    // (Firebase JS is served from there too).
    expect(script, contains('"https://www.gstatic.com"'));
    expect(line('"connect-src'), contains('local.app_check_connect'));
    expect(line('"frame-src'), contains('local.recaptcha_frame_src'));
  });
}
