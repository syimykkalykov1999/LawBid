import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/web_push_config.dart';

void main() {
  tearDown(() => WebPushConfig.applyRemote(const {}));

  test('not configured without build keys or admin keys', () {
    WebPushConfig.applyRemote(const {});
    expect(WebPushConfig.configured, isFalse);
  });

  test('keys saved in the admin (bootstrap fcm.web.*) configure the web', () {
    WebPushConfig.applyRemote(const {
      'fcm.web.api_key': 'AIzaSyKEY',
      'fcm.web.app_id': '1:1:web:a',
      'fcm.web.sender_id': '1',
      'fcm.web.project_id': 'lawbid-6e5ff',
      'fcm.web.vapid_key': 'BVAPID',
      'other.key': 'x',
    });
    expect(WebPushConfig.configured, isTrue);
    expect(WebPushConfig.options.projectId, 'lawbid-6e5ff');
    expect(WebPushConfig.vapidKey, 'BVAPID');
    expect(WebPushConfig.options.authDomain, isNull);
  });

  test('a missing key keeps it off', () {
    WebPushConfig.applyRemote(const {
      'fcm.web.api_key': 'AIzaSyKEY',
      'fcm.web.vapid_key': 'BVAPID',
    });
    expect(WebPushConfig.configured, isFalse);
  });

  test('the first key set being incomplete does not poison the whole', () {
    // The API picks the first complete set; a client given a partial one
    // (an older API) stays off rather than mixing.
    WebPushConfig.applyRemote(const {
      'fcm.web.api_key': 'AIzaSyKEY',
      'fcm.web.app_id': '1:1:web:a',
      'fcm.web.sender_id': '1',
      'fcm.web.vapid_key': 'BVAPID',
    });
    expect(WebPushConfig.configured, isFalse);
  });

  test('authDomain is optional and used when given', () {
    WebPushConfig.applyRemote(const {
      'fcm.web.api_key': 'AIzaSyKEY',
      'fcm.web.app_id': '1:1:web:a',
      'fcm.web.sender_id': '1',
      'fcm.web.project_id': 'p',
      'fcm.web.vapid_key': 'BVAPID',
      'fcm.web.auth_domain': 'p.firebaseapp.com',
    });
    expect(WebPushConfig.configured, isTrue);
    expect(WebPushConfig.options.authDomain, 'p.firebaseapp.com');
  });

  test('the fingerprint changes with the keys, not with other config', () {
    const keys = {'fcm.web.api_key': 'a', 'fcm.web.vapid_key': 'v'};
    final first = WebPushConfig.fingerprintOf(keys);
    expect(WebPushConfig.fingerprintOf({...keys, 'other': 'x'}), first);
    expect(
      WebPushConfig.fingerprintOf({...keys, 'fcm.web.api_key': 'b'}),
      isNot(first),
    );
  });

  test('a running Firebase app matches only the keys it was started with', () {
    WebPushConfig.applyRemote(const {
      'fcm.web.api_key': 'AIzaSyKEY',
      'fcm.web.app_id': '1:1:web:a',
      'fcm.web.sender_id': '1',
      'fcm.web.project_id': 'p',
      'fcm.web.vapid_key': 'BVAPID',
    });
    final started = WebPushConfig.options;
    expect(WebPushConfig.matches(started), isTrue);
    WebPushConfig.applyRemote(const {
      'fcm.web.api_key': 'AIzaSyNEW',
      'fcm.web.app_id': '1:1:web:a',
      'fcm.web.sender_id': '1',
      'fcm.web.project_id': 'p',
      'fcm.web.vapid_key': 'BVAPID',
    });
    expect(WebPushConfig.matches(started), isFalse);
  });
}
