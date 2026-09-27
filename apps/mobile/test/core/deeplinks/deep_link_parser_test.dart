import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/deeplinks/deep_link.dart';

void main() {
  DeepLink? parse(String s) => parseDeepLink(Uri.parse(s), host: 'lawbid.app');

  group('magic sign-in link (docs/01 §10.2 E/F)', () {
    test('custom scheme lawbid://auth/email-code?email&code', () {
      expect(
        parse('lawbid://auth/email-code?email=Ann%40Example.com&code=123456'),
        const EmailCodeDeepLink(email: 'ann@example.com', code: '123456'),
      );
    });

    test('universal / App Link on lawbid.app (and www.)', () {
      const expected = EmailCodeDeepLink(email: 'ann@example.com', code: '004211');
      expect(parse('https://lawbid.app/auth/email-code?email=ann@example.com&code=004211'), expected);
      expect(parse('https://www.lawbid.app/auth/email-code/?email=ann@example.com&code=004211'), expected);
    });

    test('rejects malformed codes / emails and foreign hosts', () {
      expect(parse('lawbid://auth/email-code?email=ann@example.com&code=12345'), isNull);
      expect(parse('lawbid://auth/email-code?email=ann@example.com&code=12345a'), isNull);
      expect(parse('lawbid://auth/email-code?email=not-an-email&code=123456'), isNull);
      expect(parse('lawbid://auth/email-code?code=123456'), isNull);
      expect(parse('https://evil.example/auth/email-code?email=a@b.co&code=123456'), isNull);
      expect(parse('https://lawbid.app.evil.example/auth/email-code?email=a@b.co&code=123456'), isNull);
      expect(parse('http://lawbid.app/auth/email-code?email=a@b.co&code=123456'), isNull);
      expect(parse('lawbid://auth/other?email=a@b.co&code=123456'), isNull);
    });

    test('never prints the code', () {
      expect(const EmailCodeDeepLink(email: 'a@b.co', code: '123456').toString(), isNot(contains('123456')));
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
