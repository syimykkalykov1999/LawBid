import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Item 25: the web app's MLS client (web/js/mls.js, ts-mls) as two browser
/// tabs use it — Web Locks keep two tabs from overwriting one group, a
/// pending commit survives a reload and is the only one of its group, the
/// last-resort KeyPackage serves several Welcomes, decrypted texts stay
/// sealed, sign-out leaves nothing. Runs interop/mls_js_check.mjs in node
/// (real WebCrypto and navigator.locks); skipped where node is missing.
void main() {
  final node = Process.runSync('which', ['node']).exitCode == 0;

  test(
    'mls.js: Web Locks, pending commit in IndexedDB, last resort, sealed texts',
    () async {
      final r = await Process.run('node', [
        '--no-warnings',
        'test/features/chat/e2ee/interop/mls_js_check.mjs',
      ]);
      final out = (r.stdout as String).trim().split('\n').last;
      final answer = jsonDecode(out) as Map<String, dynamic>;
      expect(answer['error'], isNull, reason: '${r.stderr}');
      expect(answer['ok'], isTrue);
      expect((answer['checks'] as List).length, 12);
    },
    skip: node ? false : 'node is not installed',
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
