import 'package:fake_async/fake_async.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' show MediaStream;
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/application/call_media_view.dart';
import 'package:lawbid/features/calls/application/call_quality.dart';

/// Owner 2026-10-26 (UI-01): the screen's view of the media holds the last
/// pictures through an SFU → mesh swap — a person's tile shows the old
/// picture until the new media shows them, never the avatar in between.
class _Stream extends Fake implements MediaStream {
  _Stream(this.id);
  @override
  final String id;
}

class _Media extends Fake implements CallMedia {
  @override
  final ValueNotifier<MediaStream?> localVideo = ValueNotifier(null);
  @override
  final ValueNotifier<MediaStream?> remoteVideo = ValueNotifier(null);
  @override
  final ValueNotifier<Map<String, MediaStream>> remoteStreams =
      ValueNotifier(const {});
  @override
  final ValueNotifier<Set<String>> speaking = ValueNotifier(const {});
  @override
  final ValueNotifier<LinkQuality> quality = ValueNotifier(LinkQuality.good);
}

void main() {
  test('mirrors the live media', () {
    final v = HeldCallMediaView();
    final m = _Media();
    v.follow(m);
    expect(v.remoteStreams.value, isEmpty);
    final u1 = _Stream('u1-sfu');
    m.remoteStreams.value = {'u1': u1};
    m.localVideo.value = _Stream('me-sfu');
    m.speaking.value = {'u1'};
    expect(v.remoteStreams.value, {'u1': u1});
    expect(v.localVideo.value?.id, 'me-sfu');
    expect(v.speaking.value, {'u1'});
    v.follow(null);
    expect(v.remoteStreams.value, isEmpty);
    expect(v.localVideo.value, isNull);
  });

  test(
      'a swap: the old pictures stay until the new media shows each person, '
      'then the hold ends a moment after the mesh is up', () {
    fakeAsync((async) {
      final v = HeldCallMediaView();
      final sfu = _Media();
      final oldU1 = _Stream('u1-sfu');
      final oldU2 = _Stream('u2-sfu');
      final oldMe = _Stream('me-sfu');
      sfu.remoteStreams.value = {'u1': oldU1, 'u2': oldU2};
      sfu.localVideo.value = oldMe;
      // The SFU media is closed and let go: everything on screen stays.
      v
        ..follow(sfu)
        ..hold(atMost: const Duration(seconds: 10));
      sfu.remoteStreams.value = const {};
      sfu.localVideo.value = null;
      v.follow(null);
      expect(v.holding, isTrue);
      expect(v.remoteStreams.value, {'u1': oldU1, 'u2': oldU2});
      expect(v.localVideo.value, same(oldMe));

      // The mesh opens: our new picture replaces ours; the others keep theirs.
      final mesh = _Media();
      v.follow(mesh);
      final newMe = _Stream('me-mesh');
      mesh.localVideo.value = newMe;
      expect(v.localVideo.value, same(newMe));
      expect(v.remoteStreams.value, {'u1': oldU1, 'u2': oldU2});

      // u1's mesh picture arrives: that tile switches, u2 still holds.
      final newU1 = _Stream('u1-mesh');
      mesh.remoteStreams.value = {'u1': newU1};
      expect(v.remoteStreams.value, {'u1': newU1, 'u2': oldU2});

      // The mesh is up: a short settle, then only the live pictures.
      v.releaseAfter(const Duration(milliseconds: 1500));
      async.elapse(const Duration(milliseconds: 1400));
      expect(v.remoteStreams.value['u2'], same(oldU2));
      async.elapse(const Duration(milliseconds: 200));
      expect(v.holding, isFalse);
      expect(v.remoteStreams.value, {'u1': newU1});
    });
  });

  test('a hold ends by itself after its limit', () {
    fakeAsync((async) {
      final v = HeldCallMediaView();
      final sfu = _Media();
      sfu.remoteStreams.value = {'u1': _Stream('u1')};
      v
        ..follow(sfu)
        ..hold(atMost: const Duration(seconds: 10))
        ..follow(null);
      async.elapse(const Duration(seconds: 9));
      expect(v.remoteStreams.value, hasLength(1));
      async.elapse(const Duration(seconds: 2));
      expect(v.holding, isFalse);
      expect(v.remoteStreams.value, isEmpty);
    });
  });

  test('clear: the call is over, nothing held, nothing drawn', () {
    final v = HeldCallMediaView();
    final sfu = _Media();
    sfu.remoteStreams.value = {'u1': _Stream('u1')};
    v
      ..follow(sfu)
      ..hold(atMost: const Duration(seconds: 10))
      ..clear();
    expect(v.holding, isFalse);
    expect(v.remoteStreams.value, isEmpty);
    expect(v.live, isNull);
  });
}
