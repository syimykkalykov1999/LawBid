import 'package:flutter/foundation.dart' show TargetPlatform;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/platform/web_open_in_app.dart';

void main() {
  final page = Uri.parse('https://lawbid.dev/g/abc?post=7');
  final store = Uri.parse('https://play.google.com/store/apps/details?id=x');

  test('android: intent link with the page and the store as fallback', () {
    final uri = openInAppUri(
      platform: TargetPlatform.android,
      page: page,
      store: store,
    )!;
    final text = uri.toString();
    expect(text, startsWith('intent://lawbid.dev/g/abc?post=7#Intent;'));
    expect(text, contains('scheme=https;package=com.lawbid.lawbid;'));
    expect(text, contains('S.browser_fallback_url=https%3A%2F%2Fplay.google'));
    expect(text, endsWith(';end'));
  });

  test('android without a store page has no fallback', () {
    final text = openInAppUri(
      platform: TargetPlatform.android,
      page: Uri.parse('https://lawbid.dev/'),
      store: null,
    )!
        .toString();
    expect(text, isNot(contains('browser_fallback_url')));
  });

  test('ios: the app link keeps path and query', () {
    final uri = openInAppUri(
      platform: TargetPlatform.iOS,
      page: page,
      store: store,
    );
    expect(uri.toString(), 'lawbid://g/abc?post=7');
    expect(uri!.host, 'g');
  });

  test('other platforms get no link', () {
    expect(
      openInAppUri(platform: TargetPlatform.macOS, page: page, store: null),
      isNull,
    );
  });
}
