import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' show MediaStream;

import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/application/call_quality.dart';

/// Owner 2026-10-26 (UI-01, «people must not notice the switch»): what the
/// call screen draws. ONE object for the whole call — it mirrors the live
/// media's pictures, and through an SFU → mesh swap it HOLDS the last
/// pictures until the mesh brings new ones. So the screen never sees "no
/// media" in the middle of a call (no avatars, no black boxes): every tile
/// keeps its renderer and only the stream underneath changes.
class HeldCallMediaView implements CallMediaView {
  final _local = ValueNotifier<MediaStream?>(null);
  final _remote = ValueNotifier<MediaStream?>(null);
  final _remotes = ValueNotifier<Map<String, MediaStream>>(const {});
  final _speaking = ValueNotifier<Set<String>>(const {});
  final _quality = ValueNotifier<LinkQuality>(LinkQuality.good);

  CallMedia? _live;
  final _unsubscribe = <VoidCallback>[];

  /// The pictures of the media that was swapped out, shown until the live
  /// media shows the same person again (or the hold ends).
  MediaStream? _heldLocal;
  MediaStream? _heldRemote;
  Map<String, MediaStream> _heldRemotes = const {};
  bool _holding = false;
  Timer? _holdTimer;

  @override
  ValueListenable<MediaStream?> get localVideo => _local;
  @override
  ValueListenable<MediaStream?> get remoteVideo => _remote;
  @override
  ValueListenable<Map<String, MediaStream>> get remoteStreams => _remotes;
  @override
  ValueListenable<Set<String>> get speaking => _speaking;
  @override
  ValueListenable<LinkQuality> get quality => _quality;

  /// The swapped-out pictures are still on screen.
  bool get holding => _holding;

  /// The live media now; null = none (the pictures go, unless held).
  CallMedia? get live => _live;

  /// Draws [media] from now on (null: nothing live). A held picture stays
  /// until the new media shows that person.
  void follow(CallMedia? media) {
    if (identical(media, _live)) {
      _refresh();
      return;
    }
    for (final off in _unsubscribe) {
      off();
    }
    _unsubscribe.clear();
    _live = media;
    if (media != null) {
      for (final l in <Listenable>[
        media.localVideo,
        media.remoteVideo,
        media.remoteStreams,
        media.speaking,
        media.quality,
      ]) {
        l.addListener(_refresh);
        _unsubscribe.add(() => l.removeListener(_refresh));
      }
    }
    _refresh();
  }

  /// Keeps what is on screen now while the media underneath is replaced:
  /// at most [atMost], or until [release].
  void hold({required Duration atMost}) {
    _heldLocal = _local.value;
    _heldRemote = _remote.value;
    _heldRemotes = Map.unmodifiable(_remotes.value);
    _holding = true;
    _holdTimer?.cancel();
    _holdTimer = Timer(atMost, release);
  }

  /// Ends the hold [after] a settle (the new media's pictures have had a
  /// moment to arrive); at once when [after] is zero.
  void releaseAfter(Duration after) {
    if (!_holding) return;
    _holdTimer?.cancel();
    _holdTimer = Timer(after, release);
  }

  /// The held pictures go; the live media alone is drawn.
  void release() {
    _holdTimer?.cancel();
    _holdTimer = null;
    if (!_holding) return;
    _holding = false;
    _heldLocal = null;
    _heldRemote = null;
    _heldRemotes = const {};
    _refresh();
  }

  /// The call is over: nothing is drawn.
  void clear() {
    release();
    follow(null);
  }

  void _refresh() {
    final m = _live;
    final local = m?.localVideo.value;
    final remote = m?.remoteVideo.value;
    final live = m?.remoteStreams.value ?? const <String, MediaStream>{};
    _local.value = local ?? (_holding ? _heldLocal : null);
    _remote.value = remote ?? (_holding ? _heldRemote : null);
    // A held person whose new picture arrived shows the new one (the
    // renderer keeps its place; only the stream changes).
    final merged = _holding ? {..._heldRemotes, ...live} : live;
    if (!mapEquals(merged, _remotes.value)) {
      _remotes.value = Map.unmodifiable(merged);
    }
    final speaking = m?.speaking.value ?? const <String>{};
    if (!setEquals(speaking, _speaking.value)) _speaking.value = speaking;
    _quality.value = m?.quality.value ?? LinkQuality.good;
  }
}
