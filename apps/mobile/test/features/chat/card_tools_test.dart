import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/domain/card_tools.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';

void main() {
  const card = ContactCard(
    userId: 'u1',
    username: 'jane.doe',
    displayName: 'Jane Mary Doe',
    verified: true,
    firmNames: ['Doe; Smith & Co'],
    practiceKeys: ['practice.family'],
    licensedStates: ['NY', 'CA'],
  );

  test('vCard 3.0: name, firm, link, no phone or e-mail', () {
    final v = buildVCard(
      card,
      role: 'Attorney',
      practice: ['Family law'],
      profileUrl: 'https://lawbid.dev/lawyer/jane.doe',
    );
    expect(v, startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'));
    expect(v, endsWith('END:VCARD\r\n'));
    expect(v, contains('FN:Jane Mary Doe\r\n'));
    expect(v, contains('N:Doe;Jane Mary;;;\r\n'));
    // A comma / semicolon in a value is escaped.
    expect(v, contains(r'ORG:Doe\; Smith & Co'));
    expect(v, contains('URL:https://lawbid.dev/lawyer/jane.doe'));
    expect(v, isNot(contains('TEL')));
    expect(v, isNot(contains('EMAIL')));
  });

  test('no line is longer than 75 octets', () {
    final v = buildVCard(
      ContactCard(
        userId: 'u2',
        username: 'x',
        displayName: 'N' * 200,
        verified: false,
      ),
      role: 'Attorney',
      practice: List.filled(20, 'Immigration law'),
      profileUrl: 'https://lawbid.dev/lawyer/x',
    );
    for (final line in v.split('\r\n')) {
      expect(line.length, lessThanOrEqualTo(75), reason: line);
    }
  });

  test('file name keeps letters and digits only', () {
    expect(vCardFileName(card), 'Jane_Mary_Doe.vcf');
    expect(
      vCardFileName(
        const ContactCard(
          userId: 'u3',
          username: 'a_b',
          displayName: r'/..\',
          verified: false,
        ),
      ),
      'a_b.vcf',
    );
  });

  test('maps link: Apple on iPhone, Google elsewhere', () {
    final apple = mapsUri('1 Main St, NY', apple: true);
    expect(apple.host, 'maps.apple.com');
    expect(apple.queryParameters['q'], '1 Main St, NY');
    final google = mapsUri('1 Main St, NY', apple: false);
    expect(google.host, 'www.google.com');
    expect(google.queryParameters['query'], '1 Main St, NY');
  });
}
