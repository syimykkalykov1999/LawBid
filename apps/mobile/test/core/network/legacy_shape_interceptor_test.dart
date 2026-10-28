import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/legacy_shape_interceptor.dart';

/// Owner 2026-10-28: an app newer than the server must still read its
/// answers — the fields the generated models require but an older server
/// does not send yet get neutral values; present fields are never touched.
void main() {
  test('my profile without `version` gets 0, a sent one stays', () {
    final body = <String, dynamic>{
      'data': <String, dynamic>{
        'id': 'att-1',
        'licenses': [
          <String, dynamic>{'id': 'l1', 'state': 'NY'},
        ],
      },
      'meta': <String, dynamic>{
        'disclaimer': <String, dynamic>{'id': 'd', 'version': '2026-10'},
      },
    };
    fixLegacyShape('/attorneys/me/profile', body);
    final data = body['data'] as Map<String, dynamic>;
    expect(data['version'], 0);
    // `meta` is never a model: its string version is left alone.
    final meta = body['meta'] as Map<String, dynamic>;
    expect((meta['disclaimer'] as Map)['version'], '2026-10');

    final fresh = <String, dynamic>{
      'data': <String, dynamic>{'id': 'att-1', 'version': 7},
    };
    fixLegacyShape('/api/v1/attorneys/me/profile', fresh);
    expect((fresh['data'] as Map)['version'], 7);
  });

  test("a case's bids get version, bestPrice and lowOffer", () {
    final body = <String, dynamic>{
      'data': [
        <String, dynamic>{
          'id': 'b1',
          'feeType': 'flat',
          'attorney': <String, dynamic>{'id': 'a'},
        },
      ],
    };
    fixLegacyShape('/cases/c1/bids?sort=best', body);
    final bid = (body['data'] as List).first as Map<String, dynamic>;
    expect(bid['version'], 0);
    expect(bid['bestPrice'], false);
    expect(bid['lowOffer'], false);
  });

  test('other routes are not touched', () {
    final body = <String, dynamic>{
      'data': <String, dynamic>{'id': 'x'},
    };
    fixLegacyShape('/i18n/bundle/en', body);
    fixLegacyShape('/legal/documents', body);
    expect((body['data'] as Map).containsKey('version'), isFalse);
  });

  test('consultations, answers and promotions get their new fields', () {
    final c = <String, dynamic>{
      'data': [
        <String, dynamic>{'id': 'c', 'startsAt': 't', 'viewerRole': 'client'},
      ],
    };
    fixLegacyShape('/consultations', c);
    final row = (c['data'] as List).first as Map;
    expect(row['canMarkNoShow'], false);
    expect(row['noShows'], isEmpty);

    final q = <String, dynamic>{
      'data': <String, dynamic>{
        'id': 'q',
        'answers': [
          <String, dynamic>{'id': 'a', 'questionId': 'q', 'body': 'b'},
        ],
      },
    };
    fixLegacyShape('/questions/q', q);
    final answer = ((q['data'] as Map)['answers'] as List).first as Map;
    expect(answer['verifiedBadge'], false);

    final p = <String, dynamic>{
      'data': <String, dynamic>{
        'active': <String, dynamic>{
          'id': 'p',
          'targetType': 'post',
          'priceCentsPerDay': 100,
          'impressions': 12,
        },
      },
    };
    fixLegacyShape('/posts/p1/promotion', p);
    final promo = (p['data'] as Map)['active'] as Map;
    expect(promo['billing'], 'impressions');
    expect(promo['deliveredUnits'], 12);
    expect(promo['refundedCents'], 0);
  });
}
