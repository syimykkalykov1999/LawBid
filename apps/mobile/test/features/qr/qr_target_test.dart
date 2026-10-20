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
}
