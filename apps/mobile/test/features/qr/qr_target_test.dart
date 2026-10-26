import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/deeplinks/deep_link.dart';
import 'package:lawbid/features/qr/domain/qr_target.dart';

void main() {
  QrTarget c(String s) => classifyQr(s, host: 'lawbid.dev');
  DeepLink? p(String s) => parseDeepLink(Uri.parse(s), host: 'lawbid.dev');

  test('deep links: profile, website sign-in and group invitation', () {
    expect(p('https://lawbid.dev/u/jane_doe'), isA<ProfileDeepLink>());
    expect(p('lawbid://u/jane_doe'), isA<ProfileDeepLink>());
    expect(
      p('https://lawbid.dev/g/AbCdEf1234567890abcd'),
      isA<GroupInviteDeepLink>(),
    );
    expect(
      p('https://lawbid.dev/q/AbCdEf1234567890abcd'),
      isA<WebLoginDeepLink>(),
    );
    expect(p('https://evil.example/u/jane_doe'), isNull);
  });

  test('our profile link opens the profile', () {
    final t = c('https://lawbid.dev/u/jane_doe');
    expect(t, isA<ProfileQrTarget>());
    expect((t as ProfileQrTarget).username, 'jane_doe');
  });

  test('group invitation and website sign-in links are recognised', () {
    expect(
      c('https://lawbid.dev/g/AbCdEf1234567890abcd'),
      isA<GroupInviteQrTarget>(),
    );
    expect(
      c('https://lawbid.dev/q/AbCdEf1234567890abcd'),
      isA<WebLoginQrTarget>(),
    );
  });

  test('foreign links go to the browser, plain text stays text', () {
    expect(c('https://example.com/x'), isA<ExternalUrlQrTarget>());
    expect(c('https://lawbid.dev.evil.com/u/jane'), isA<ExternalUrlQrTarget>());
    expect(c('hello world'), isA<TextQrTarget>());
    expect(c('javascript:alert(1)'), isA<TextQrTarget>());
  });

  // Owner 2026-10-22 (QR login): the website's QR code now carries the
  // universal link `https://lawbid.dev/qr/<nonce>`; the in-app scanner and
  // the deep-link router treat it exactly like the older `/q/<id>` payload.
  const nonce = 'Xk3_aB-9Qz1LmN4pR7sT0wXk3_aB-9Qz1LmN4pR7sT0w';

  test('/qr/<nonce> is the website sign-in question (link and scanner)', () {
    final link = p('https://lawbid.dev/qr/$nonce');
    expect(link, isA<WebLoginDeepLink>());
    expect((link! as WebLoginDeepLink).qrId, nonce);
    expect(p('lawbid://qr/$nonce'), isA<WebLoginDeepLink>());
    final target = c('https://lawbid.dev/qr/$nonce');
    expect(target, isA<WebLoginQrTarget>());
    expect((target as WebLoginQrTarget).qrId, nonce);
    // The older payload still works.
    expect(
      c('https://lawbid.dev/q/Xk3_aB-9Qz1LmN4pR7sT0w'),
      isA<WebLoginQrTarget>(),
    );
  });

  test("the app's own /qr/my and /qr/scan are never links", () {
    expect(p('https://lawbid.dev/qr/my'), isNull);
    expect(p('https://lawbid.dev/qr/scan'), isNull);
    expect(p('https://lawbid.dev/qr/short'), isNull);
  });
}
