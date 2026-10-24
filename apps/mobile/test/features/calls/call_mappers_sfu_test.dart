import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';

/// Owner 2026-10-24: what the app reads of the SFU fields of the API.
Map<String, Object?> _participant(
  String id, {
  Object? tracks = 'absent',
  bool ready = false,
}) =>
    {
      'userId': id,
      'displayName': id,
      'status': 'joined',
      'muted': false,
      'mutedByHost': false,
      'sfuReady': ready,
      if (tracks != 'absent') 'sfuTracks': tracks,
    };

void main() {
  test('call:participants carries the media facts and each roster', () {
    final m = CallMappers.participantsFromEvent({
      'callId': 'c1',
      'hostId': 'u1',
      'mediaProvider': 'cloudflare',
      'video': false,
      'mediaFallback': {
        'active': true,
        'reason': 'sfu_unavailable',
        'videoBlocked': true,
        'videoMaxParticipants': 4,
      },
      'participants': [
        _participant('u1', tracks: ['mic', 'cam'], ready: true),
        _participant('u2', tracks: <String>[]),
        _participant('u3'),
      ],
    })!;
    expect(m.mediaProvider, CallMediaProvider.cloudflare);
    expect(m.video, isFalse);
    expect(m.fallback!.videoBlocked, isTrue);
    expect(m.fallback!.active, isTrue);
    expect(m.fallback!.videoMaxParticipants, 4);
    expect(m.members[0].sfuTracks, {'mic', 'cam'});
    // Nothing published yet is not the same as "not said".
    expect(m.members[1].sfuTracks, isEmpty);
    expect(m.members[2].sfuTracks, isNull);
  });

  test('an older payload without the media fields still reads', () {
    final m = CallMappers.participantsFromEvent({
      'callId': 'c1',
      'participants': [_participant('u1')],
    })!;
    expect(m.mediaProvider, isNull);
    expect(m.video, isNull);
    expect(m.fallback, isNull);
    expect(m.members.single.sfuTracks, isNull);
  });

  test('the provider of a call: cloudflare, else p2p', () {
    expect(
      CallMappers.mediaProviderOf('cloudflare'),
      CallMediaProvider.cloudflare,
    );
    expect(CallMappers.mediaProviderOf('p2p'), CallMediaProvider.p2p);
    expect(CallMappers.mediaProviderOf(null), CallMediaProvider.p2p);
    expect(CallMappers.mediaProviderOf('whatever'), CallMediaProvider.p2p);
  });
}
