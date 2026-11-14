import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner row 146: a voice note recorded on the website in Firefox / Linux
/// Chrome is Opus in WebM, which the iPhone's player cannot play. The server
/// adds `voice.m4aUrl` (an AAC/M4A copy); the iPhone plays that copy, every
/// other platform keeps the original link.
Map<String, dynamic> _json({String? m4aUrl}) => {
      'id': 'm1',
      'conversationId': 'c1',
      'senderId': 'other',
      'type': 'voice',
      'body': '',
      'contactMasked': false,
      'createdAt': '2026-11-14T10:00:00.000Z',
      'revoked': false,
      'forwarded': false,
      'reactions': <dynamic>[],
      'pinned': false,
      'voice': {
        'url': 'https://s3/voice/k',
        'm4aUrl': m4aUrl,
        'durationMs': 1500,
        'waveform': <int>[1, 2, 3],
        'listened': false,
      },
    };

ChatMessage _map(Map<String, dynamic> j) =>
    ChatMappers.message(api.MessageDto.fromJson(j));

void main() {
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  test('iPhone: the AAC/M4A copy of a WebM note is played', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    expect(
      _map(_json(m4aUrl: 'https://s3/voice/k.m4a')).voice!.url,
      'https://s3/voice/k.m4a',
    );
  });

  test('iPhone: a note without a copy keeps its own link', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    expect(_map(_json()).voice!.url, 'https://s3/voice/k');
  });

  test('Android keeps the original (it plays WebM)', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    expect(
      _map(_json(m4aUrl: 'https://s3/voice/k.m4a')).voice!.url,
      'https://s3/voice/k',
    );
  });

  test('the choice itself', () {
    expect(
      playableVoiceUrl('a', 'b', platform: TargetPlatform.iOS, web: false),
      'b',
    );
    expect(
      playableVoiceUrl('a', null, platform: TargetPlatform.iOS, web: false),
      'a',
    );
    expect(
      playableVoiceUrl('a', 'b', platform: TargetPlatform.android, web: false),
      'a',
    );
    // The website plays the original when the browser plays Opus in WebM.
    expect(
      playableVoiceUrl(
        'a',
        'b',
        platform: TargetPlatform.iOS,
        web: true,
        webPlaysWebm: () => true,
      ),
      'a',
    );
  });

  test(
      'R2 review: a browser that cannot play Opus in WebM (canPlayType "") '
      'gets the AAC/M4A copy, or the original when there is none', () {
    expect(
      playableVoiceUrl('a', 'b', web: true, webPlaysWebm: () => false),
      'b',
    );
    expect(
      playableVoiceUrl('a', null, web: true, webPlaysWebm: () => false),
      'a',
    );
  });
}
