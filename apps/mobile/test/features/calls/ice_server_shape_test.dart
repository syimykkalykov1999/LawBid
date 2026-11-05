import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// What GET /calls/ice-servers answers with Cloudflare only: the STUN entry
/// with null login and the relay entry with Cloudflare's six urls (shape from
/// developers.cloudflare.com/realtime/turn/generate-credentials, 2026-11-04).
void main() {
  test('the Cloudflare answer reaches the native config whole', () {
    final body = api.IceServersDto.fromJson({
      'iceServers': [
        {
          'urls': [
            'turn:turn.cloudflare.com:3478?transport=udp',
            'turn:turn.cloudflare.com:443?transport=udp',
            'turn:turn.cloudflare.com:3478?transport=tcp',
            'turn:turn.cloudflare.com:80?transport=tcp',
            'turns:turn.cloudflare.com:5349?transport=tcp',
            'turns:turn.cloudflare.com:443?transport=tcp',
          ],
          'username': 'test-user',
          'credential': 'test-credential',
        },
        {
          'urls': ['stun:stun.cloudflare.com:3478'],
          'username': null,
          'credential': null,
        },
      ],
      'ttlSec': 86400,
    });
    final json = [
      for (final s in body.iceServers)
        IceServer(
          urls: s.urls,
          username: s.username,
          credential: s.credential,
        ).toJson(),
    ];
    expect((json[0]['urls']! as List).length, 6);
    expect(json[0]['username'], 'test-user');
    expect(json[0]['credential'], 'test-credential');
    // Android's IceServer builder throws on a null username: the keys of a
    // STUN entry must be absent, not null.
    expect(json[1].containsKey('username'), isFalse);
    expect(json[1].containsKey('credential'), isFalse);
  });
}
