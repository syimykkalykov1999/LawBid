import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/notifications/application/push_service.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// Owner 2026-10-28: a video call to the iPhone never rang — only «missed
/// call» came. Prod: «apns voip ring done devices: 0» right after the
/// account on the iPhone changed (another phone took the account, a new
/// sign-in followed). The PushKit token was bound to the old session and
/// the app skipped re-sending «the same token». Every sign-in — the same
/// account too — registers the device's tokens for its new session.
class _Push extends PushService {
  _Push(super.ref);
  int forgets = 0;

  @override
  void forgetSession() => forgets++;

  @override
  Future<void> start() async {}
}

void main() {
  test('signed out by the server: the push registration is forgotten', () {
    late _Push push;
    final c = ProviderContainer(
      overrides: [
        currentUserIdProvider.overrideWithValue(null),
        pushServiceProvider.overrideWith((ref) => push = _Push(ref)),
      ],
    );
    addTearDown(c.dispose);
    c.read(sessionServicesProvider);
    expect(push.forgets, 1);
  });

  test('a new sign-in sends the VoIP token again (no «same token» skip)', () {
    final src = File(
      'lib/features/notifications/application/push_service.dart',
    ).readAsStringSync();
    final start = src.substring(
      src.indexOf('Future<void> start() async {'),
      src.indexOf('final registrar = _registrar = _newRegistrar(user);'),
    );
    expect(start, contains('_startedFor = user;'));
    expect(start, contains('_voipToken = null;'));
    final forget = src.substring(src.indexOf('void forgetSession() {'));
    expect(
      forget.substring(0, forget.indexOf('}')),
      allOf(contains('_startedFor = null;'), contains('_voipToken = null;')),
    );
  });
}
