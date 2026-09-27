import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/deeplinks/deep_link.dart';

void main() {
  DeepLink? parse(String s) => parseDeepLink(Uri.parse(s), host: 'lawbid.app');

  group('magic sign-in link (docs/01 §10.2 E/F, security review 2026-09-27)', () {
    const token = 'Tk_-0123456789abcdefghijABCDEFGHIJ012345678'; // 43 base64url chars

    test('custom scheme lawbid://auth/email-code?token', () {
      expect(parse('lawbid://auth/email-code?token=$token'), const EmailCodeDeepLink(token: token));
    });

    test('universal / App Link on lawbid.app (and www., trailing slash)', () {
      const expected = EmailCodeDeepLink(token: token);
      expect(parse('https://lawbid.app/auth/email-code?token=$token'), expected);
      expect(parse('https://www.lawbid.app/auth/email-code/?token=$token'), expected);
    });

    test('rejects malformed tokens, legacy email+code links and foreign hosts', () {
      expect(parse('lawbid://auth/email-code?token=${token.substring(1)}'), isNull); // 42
      expect(parse('lawbid://auth/email-code?token=${token}A'), isNull); // 44
      expect(parse('lawbid://auth/email-code?token=${token.substring(1)}='), isNull); // padding
      expect(parse('lawbid://auth/email-code?token=${token.substring(1)}%2B'), isNull); // '+'
      expect(parse('lawbid://auth/email-code?token=${token.substring(1)}%20'), isNull);
      expect(parse('lawbid://auth/email-code?token='), isNull);
      expect(parse('lawbid://auth/email-code'), isNull);
      expect(parse('lawbid://auth/email-code?email=ann@example.com&code=123456'), isNull);
      expect(parse('https://evil.example/auth/email-code?token=$token'), isNull);
      expect(parse('https://lawbid.app.evil.example/auth/email-code?token=$token'), isNull);
      expect(parse('http://lawbid.app/auth/email-code?token=$token'), isNull);
      expect(parse('lawbid://auth/other?token=$token'), isNull);
    });

    test('never prints the token', () {
      expect(const EmailCodeDeepLink(token: token).toString(), isNot(contains(token)));
    });
  });

  group('content links (docs/01 §12)', () {
    test('case / lawyer / post on both forms', () {
      const id = '3f0c9a8e-1b2d-4c5e-9f00-112233445566';
      expect(parse('https://lawbid.app/case/$id'), const ContentDeepLink(ContentKind.caseItem, id));
      expect(parse('lawbid://case/$id'), const ContentDeepLink(ContentKind.caseItem, id));
      expect(parse('https://lawbid.app/post/$id'), const ContentDeepLink(ContentKind.post, id));
      expect(parse('https://lawbid.app/lawyer/jane.doe_esq'), const ContentDeepLink(ContentKind.lawyer, 'jane.doe_esq'));
      expect(parse('https://lawbid.app/lawyer/@jane.doe'), const ContentDeepLink(ContentKind.lawyer, 'jane.doe'));
    });

    test('in-app locations', () {
      expect(const ContentDeepLink(ContentKind.caseItem, 'abc').location, '/case/abc');
      expect(const ContentDeepLink(ContentKind.lawyer, 'jane').location, '/lawyer/jane');
      expect(const ContentDeepLink(ContentKind.post, 'p1').location, '/post/p1');
    });

    test('rejects bad ids, usernames and unknown paths', () {
      expect(parse('https://lawbid.app/lawyer/ab'), isNull); // < 3 chars
      expect(parse('https://lawbid.app/lawyer/${'a' * 31}'), isNull); // > 30 chars
      expect(parse('https://lawbid.app/lawyer/jane%20doe'), isNull);
      expect(parse('https://lawbid.app/case/../../etc'), isNull);
      expect(parse('https://lawbid.app/case/a/b'), isNull);
      expect(parse('https://lawbid.app/case'), isNull);
      expect(parse('https://lawbid.app/'), isNull);
      expect(parse('https://lawbid.app/admin/1'), isNull);
      expect(parse('mailto:ann@example.com'), isNull);
    });

    test('host is configurable (owner-supplied domain)', () {
      expect(
        parseDeepLink(Uri.parse('https://links.example.com/case/abc'), host: 'links.example.com'),
        const ContentDeepLink(ContentKind.caseItem, 'abc'),
      );
      expect(
        parseDeepLink(Uri.parse('https://lawbid.app/case/abc'), host: 'links.example.com'),
        isNull,
      );
    });
  });
}
