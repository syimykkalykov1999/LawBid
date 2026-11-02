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
}
