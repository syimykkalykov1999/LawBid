import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' show MediaStream;
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/application/call_quality.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';

/// A camera picture in a widget test (no WebRTC there).
class FakeStream extends Fake implements MediaStream {
  FakeStream(this.id);

  @override
  final String id;
}

/// The media of a call in a widget test: who sends a picture.
class FakeCallMedia extends Fake implements CallMedia {
  FakeCallMedia({
    MediaStream? remote,
    MediaStream? local,
    Map<String, MediaStream> remotes = const {},
    Set<String> speaking = const {},
  })  : remoteVideo = ValueNotifier(remote),
        localVideo = ValueNotifier(local),
        remoteStreams = ValueNotifier(remotes),
        speaking = ValueNotifier(speaking);

  @override
  final ValueListenable<MediaStream?> remoteVideo;

  @override
  final ValueListenable<MediaStream?> localVideo;

  @override
  final ValueListenable<Map<String, MediaStream>> remoteStreams;

  @override
  final ValueListenable<Set<String>> speaking;

  @override
  final ValueListenable<LinkQuality> quality = ValueNotifier(LinkQuality.good);

  @override
  Set<String> get peers => remoteStreams.value.keys.toSet();
}

class FixedCallController extends CallController {
  FixedCallController(this.session, this.fakeMedia);
  final CallSession session;
  final CallMedia? fakeMedia;

  @override
  CallSession build() => session;

  @override
  CallMedia? get media => fakeMedia;
}

class FixedLayout extends CallVideoLayoutNotifier {
  FixedLayout(this.initial);
  final CallVideoLayout initial;

  @override
  CallVideoLayout build() => initial;
}

/// A picture stand-in: a soft gradient with the stream's id, so a golden
/// shows where each camera sits.
Widget fakeVideo(MediaStream stream, {bool mirror = false}) {
  final hue = (stream.id.hashCode % 360).toDouble();
  return DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          HSLColor.fromAHSL(1, hue, 0.35, 0.55).toColor(),
          HSLColor.fromAHSL(1, (hue + 40) % 360, 0.35, 0.25).toColor(),
        ],
      ),
    ),
    child: Center(
      child: Icon(
        Icons.person,
        size: 120,
        color: Colors.white.withValues(alpha: 0.35),
      ),
    ),
  );
}

const _peer = CallPeer(id: 'u1', isAttorney: true, displayName: 'Amelia Hart');

CallSession callSession1to1(CallPhase phase, {bool video = false}) =>
    CallSession(
      phase: phase,
      video: video,
      connectedAt: phase == CallPhase.active
          ? DateTime.now().subtract(const Duration(minutes: 1, seconds: 29))
          : null,
      peer: _peer,
      call: AppCall(
        id: 'c1',
        conversationId: 'x',
        status:
            phase == CallPhase.active ? CallStatus.active : CallStatus.ringing,
        outgoing: phase != CallPhase.incoming,
        peer: _peer,
        createdAt: DateTime(2026, 10, 26),
        video: video,
      ),
    );

const _names = [
  'Syimyk Kalykov',
  'Amelia Hart',
  'Daniel Brooks',
  'Sofia Martinez',
  'Kenji Watanabe',
  'Lena Fischer',
  'Omar Haddad',
  'Priya Nair',
  'Tom Becker',
];

CallSession callSessionGroup(int people, {bool video = false}) => CallSession(
      phase: CallPhase.active,
      video: video,
      connectedAt: DateTime.now().subtract(const Duration(minutes: 3)),
      peer: _peer,
      call: AppCall(
        id: 'g1',
        conversationId: 'x',
        status: CallStatus.active,
        outgoing: true,
        peer: _peer,
        createdAt: DateTime(2026, 10, 26),
        video: video,
        group: true,
        hostId: 'u0',
        participants: [
          for (var i = 0; i < people; i++)
            CallMember(
              userId: 'u$i',
              status: CallMemberStatus.joined,
              displayName: _names[i % _names.length],
              muted: i == 2,
              joinedAt: DateTime.utc(2026, 10, 26),
            ),
        ],
      ),
    );

/// The media a session shows: 1:1 video has both pictures; a group video
/// has every camera but the third person's (camera off → their photo).
CallMedia? fakeMediaFor(CallSession s) {
  if (!s.video || s.phase != CallPhase.active) return FakeCallMedia();
  final call = s.call!;
  if (!call.group) {
    return FakeCallMedia(remote: FakeStream('them'), local: FakeStream('me'));
  }
  return FakeCallMedia(
    local: FakeStream('me'),
    remotes: {
      for (final m in call.participants.skip(1))
        if (m.userId != 'u2') m.userId: FakeStream(m.userId),
    },
    speaking: {'u1'},
  );
}

List<Override> callScreenFakeOverrides(
  CallSession s, {
  CallVideoLayout layout = const CallVideoLayout(),
}) =>
    [
      callMyIdProvider.overrideWithValue('u0'),
      callControllerProvider
          .overrideWith(() => FixedCallController(s, fakeMediaFor(s))),
      callVideoLayoutProvider.overrideWith(() => FixedLayout(layout)),
      callVideoSurfaceProvider.overrideWithValue(fakeVideo),
    ];
