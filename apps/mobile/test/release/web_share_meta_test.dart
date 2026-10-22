import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Owner 2026-10-22 (audit #4 §9): the link preview picture of the web app
/// must be an absolute address — chats and social sites ignore a relative
/// `og:image` (https://ogp.me).
void main() {
  test('web/index.html og:image is an absolute https URL', () {
    final html = File('web/index.html').readAsStringSync();
    final match =
        RegExp('<meta property="og:image" content="([^"]+)"').firstMatch(html);
    expect(match, isNotNull);
    final uri = Uri.parse(match!.group(1)!);
    expect(uri.isAbsolute, isTrue);
    expect(uri.scheme, 'https');
  });
}
