import 'dart:async';
import 'dart:ui' show Size;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/application/call_quality.dart';
import 'package:lawbid/features/calls/application/sfu_rtc.dart';
import 'package:lawbid/features/calls/data/calls_sfu_api.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';

/// Owner 2026-10-24 (group calls on Cloudflare SFU, design doc
/// docs/architecture/GROUP_CALLS_CLOUDFLARE_SFU.md §11): the media of a call
/// whose `mediaProvider` is `cloudflare`. ONE PeerConnection per call; our
/// mic and camera go out once, the others' come back through it.
///
/// The call logic (CallController) keeps every other thing — the members,
/// mute, camera flags, host actions — and only asks this class for the
/// transport.
abstract interface class SfuCallMedia implements CallMedia {
  /// Who publishes what now, from `call:participants`: every other joined
  /// member by user id. A null set = the server did not say (the pulls we
  /// hold stay as they are); a member missing from the map has left.
  Future<void> syncRoster(Map<String, Set<String>?> others);

  /// The simulcast layer wanted for each person's camera (big tile = f,
  /// small = q); sent to the server when it differs from what is pulled.
  void setLayers(Map<String, SfuRid> wanted);

  /// The link dropped or the network changed: an ICE restart on the same
  /// connection while Cloudflare keeps the session (about 30 s), else a new
  /// session (publish and pull everything again). Safe to call repeatedly.
  Future<void> reconnect();
}

/// [CallMedia]'s link id for the one SFU connection (the controller keys its
/// reconnect timers by it).
const kSfuLinkId = 'sfu';

/// Owner 2026-10-24: the simulcast layer that fits a tile of [size]
/// (logical px): the big picture gets the full one, a small tile the quarter.
SfuRid sfuRidForTile(Size size) {
  final side = size.shortestSide;
  if (side >= 300) return SfuRid.f;
  if (side >= 150) return SfuRid.h;
  return SfuRid.q;
}

/// The size of a tile as the call screen lays it out on a phone about 360
/// logical px wide: the big picture, a strip tile, or a grid cell of [total]
/// people (2 columns up to 4 people, else 3). The screens are not asked;
/// this only stands in for their size to pick a layer.
Size nominalTileSize({
  required int total,
  required bool focused,
  required bool anyFocus,
}) {
  const width = 360.0;
  if (focused) return const Size(width, 560);
  if (anyFocus) return const Size(72, 96);
  final cols = total <= 4 ? 2 : 3;
  final w = (width - 32 - 8 * (cols - 1)) / cols;
  return Size(w, w.clamp(60.0, 280.0));
}

/// Which layers of OUR camera may send at a link quality: a weak link drops
/// the big ones first (the audio always goes on).
Set<String> sfuLayersFor(LinkQuality q) => switch (q) {
      LinkQuality.good => const {'f', 'h', 'q'},
      LinkQuality.fair => const {'h', 'q'},
      LinkQuality.poor => const {'q'},
      LinkQuality.bad => const <String>{},
    };

class _Pull {
  const _Pull(this.userId, this.trackName);
  final String userId;
  final String trackName;
}

typedef _Orphan = ({MediaStreamTrack track, MediaStream stream});

class CloudflareSfuCallMedia implements SfuCallMedia {
  CloudflareSfuCallMedia({
    required this.callId,
    required CallsSfuApi api,
    required SfuRtc rtc,
    this.iceRestartWindow = const Duration(seconds: 12),
    this.sessionWindow = const Duration(seconds: 30),
    this.cameraCloseAfter = const Duration(seconds: 20),
    this.qualityEvery = const Duration(seconds: 3),
    this.levelsEvery = const Duration(milliseconds: 500),
    this.layerDebounce = const Duration(milliseconds: 300),
    this.retryPause = const Duration(milliseconds: 400),
    this.maxRecreate = 3,
    DateTime Function()? clock,
  })  : _api = api,
        _rtc = rtc,
        _now = clock ?? DateTime.now;

  final String callId;
  final CallsSfuApi _api;
  final SfuRtc _rtc;
  final DateTime Function() _now;

  /// How long an ICE restart gets before a new session is made.
  final Duration iceRestartWindow;

  /// Cloudflare keeps a dropped session this long (design doc §2).
  final Duration sessionWindow;

  /// A camera that stays off this long stops being published (saves the
  /// SFU's traffic and the others' pulls).
  final Duration cameraCloseAfter;
  final Duration qualityEvery;
  final Duration levelsEvery;
  final Duration layerDebounce;
  final Duration retryPause;
  final int maxRecreate;

  // --- State ---

  MediaStream? _mic;
  SfuPeer? _peer;
  void Function(CallMediaState)? _onState;
  List<IceServer> _turn = const [];
  List<IceServer> _sessionIce = const [];
  bool _closed = false;

  /// Bumped when a connection is replaced or the media closes: events of
  /// an older connection are ignored.
  int _gen = 0;
  CallMediaState? _peerState;
  DateTime? _downSince;
  final _waiters = <Completer<bool>>[];
  Future<void>? _reconnecting;

  /// trackName -> our mid, for what we publish.
  final _published = <String, String>{};
  bool _camClosed = false;
  Timer? _camTimer;

  /// mid -> who it carries (what we pull).
  final _pulls = <String, _Pull>{};
  final _orphans = <String, _Orphan>{};
  final _trackUser = <String, String>{};
  Map<String, Set<String>?> _roster = {};
  final _wanted = <String, SfuRid>{};
  final _applied = <String, SfuRid>{};
  Timer? _layerTimer;
  Timer? _resyncTimer;
  var _resyncFails = 0;

  // The queue: Cloudflare takes one SDP exchange of a session at a time.
  Future<void> _tail = Future.value();

  final _local = ValueNotifier<MediaStream?>(null);
  final _remote = ValueNotifier<MediaStream?>(null);
  final _remotes = ValueNotifier<Map<String, MediaStream>>(const {});
  final _speaking = ValueNotifier<Set<String>>(const {});
  final _quality = ValueNotifier<LinkQuality>(LinkQuality.good);
  final _tracker = QualityTracker();
  Set<String>? _layersNow;
  Timer? _qualityTimer;
  Timer? _levelTimer;
  bool _mutedNow = false;

  // --- CallMedia: the parts the screens read ---

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

  /// The people whose tracks we pull.
  @override
  Set<String> get peers => {for (final p in _pulls.values) p.userId};

  // --- Open / publish ---

  @override
  Future<void> open(
    List<IceServer> iceServers, {
    required void Function(Map<String, Object?> signal) onSignal,
    required void Function(CallMediaState state) onState,
    bool video = false,
    String peer = '',
  }) async {
    _onState = onState;
    _turn = iceServers;
    _mic = await _rtc.openUserMedia(video: video);
    if (video) _local.value = _mic;
    await _serial(_connect);
    await setSpeaker(video);
    onState(CallMediaState.connecting);
    _qualityTimer ??= Timer.periodic(
      qualityEvery,
      (_) => unawaited(_pollQuality()),
    );
  }

  Future<void> _serial(Future<void> Function() job) {
    final run = _tail.then((_) => job());
    _tail = run.then<void>((_) {}, onError: (Object _) {});
    return run;
  }

  List<IceServer> get _servers => [..._sessionIce, ..._turn];

  MediaStreamTrack? get _camTrack => _mic?.getVideoTracks().firstOrNull;

  /// A new session, one connection, our tracks published. Runs in the queue.
  Future<void> _connect() async {
    if (_closed) return;
    final mic = _mic;
    if (mic == null) throw StateError('media is not open');
    final session = await _api.session(callId);
    if (_closed) return;
    _sessionIce = session.iceServers;
    final gen = ++_gen;
    _peerState = CallMediaState.connecting;
    final peer = await _rtc.createPeer(
      _servers,
      onTrack: (mid, track, stream) => _onTrack(gen, mid, track, stream),
      onState: (s) => _onPeerState(gen, s),
    );
    _peer = peer;
    final mics = mic.getAudioTracks();
    if (mics.isEmpty) throw StateError('no microphone');
    await peer.addSend(mics.first, mic);
    final cam = _camTrack;
    final withCam = cam != null && !_camClosed;
    if (withCam) await peer.addSend(cam, mic, simulcast: true);
    final offer = await peer.createOffer();
    final mids = sendMidsOf(offer);
    final names = <String, String>{
      if (mids.audio != null) mids.audio!: kSfuMic,
      if (withCam && mids.video != null) mids.video!: kSfuCam,
    };
    if (names.isEmpty) throw StateError('the offer sends nothing');
    final res = await _api.publish(callId, sdp: offer, trackNameByMid: names);
    if (_closed || gen != _gen) return;
    await peer.setRemote('answer', res.sdp);
    _published
      ..clear()
      ..addAll({
        for (final e in res.tracks.entries)
          if (e.value.isNotEmpty) e.value: e.key,
      });
    if (!_published.containsKey(kSfuMic)) {
      throw StateError('the SFU refused the microphone: ${res.failed}');
    }
  }

  void _onPeerState(int gen, CallMediaState s) {
    if (gen != _gen || _closed) return;
    _peerState = s;
    if (s == CallMediaState.connected) {
      _downSince = null;
      _wake(true);
    } else if (s == CallMediaState.disconnected || s == CallMediaState.failed) {
      _downSince ??= _now();
    }
    _onState?.call(s);
  }

  void _wake(bool ok) {
    for (final w in _waiters.toList()) {
      if (!w.isCompleted) w.complete(ok);
    }
    _waiters.clear();
  }

  Future<bool> _waitConnected(Duration d, int gen) async {
    if (_peerState == CallMediaState.connected) return true;
    final c = Completer<bool>();
    _waiters.add(c);
    final t = Timer(d, () {
      if (!c.isCompleted) c.complete(false);
    });
    final ok = await c.future;
    t.cancel();
    return ok && gen == _gen && !_closed;
  }

  // --- Pull ---

  @override
  Future<void> syncRoster(Map<String, Set<String>?> others) {
    if (_closed) return Future.value();
    final next = <String, Set<String>?>{};
    others.forEach((u, tracks) {
      // "Unknown" keeps what we last heard of that person.
      next[u] = tracks ?? _roster[u];
    });
    _roster = next;
    return _serial(_syncPulls).catchError((Object _) => _resyncLater());
  }

  void _resyncLater() {
    if (_closed || _resyncTimer != null || _resyncFails >= 5) return;
    _resyncFails++;
    _resyncTimer = Timer(const Duration(seconds: 3), () {
      _resyncTimer = null;
      if (_closed) return;
      unawaited(
        _serial(_syncPulls).then<void>(
          (_) => _resyncFails = 0,
          onError: (Object _) => _resyncLater(),
        ),
      );
    });
  }

  Map<String, Set<String>> _pulledByUser() {
    final out = <String, Set<String>>{};
    for (final p in _pulls.values) {
      (out[p.userId] ??= {}).add(p.trackName);
    }
    return out;
  }

  Future<void> _syncPulls() async {
    final peer = _peer;
    if (peer == null || _closed) return;
    for (var round = 0; round < 6; round++) {
      // 1. Those who left, or stopped a track: drop what we pull of them.
      final have = _pulledByUser();
      for (final u in have.keys.toList()) {
        final want = _roster[u];
        final gone = !_roster.containsKey(u);
        final lost = want != null && have[u]!.any((n) => !want.contains(n));
        if (gone || lost) await _closeUserNow(u);
      }
      // 2. Pull what is new, in as few requests as the layers allow.
      final now = _pulledByUser();
      final groups =
          <String, ({List<String> users, List<String> names, SfuRid? rid})>{};
      _roster.forEach((u, want) {
        if (want == null) return;
        final need = want.difference(now[u] ?? const {});
        if (need.isEmpty) return;
        final names = need.toList()..sort();
        final rid = need.contains(kSfuCam) ? (_wanted[u] ?? SfuRid.h) : null;
        final key = '${names.join(',')}|${rid?.name}';
        final g = groups[key];
        if (g == null) {
          groups[key] = (users: [u], names: names, rid: rid);
        } else {
          g.users.add(u);
        }
      });
      if (groups.isEmpty) return;
      var again = false;
      for (final g in groups.values) {
        final r = await _retrying(
          () => _api.subscribe(
            callId,
            userIds: g.users,
            trackNames: g.names,
            rid: g.rid,
          ),
        );
        for (final s in r.subscriptions) {
          _pulls[s.mid] = _Pull(s.userId, s.trackName);
          if (s.trackName == kSfuCam) _applied[s.userId] = g.rid ?? SfuRid.h;
        }
        if (r.requiresAnswer && r.sdp != null) {
          await peer.setRemote('offer', r.sdp!);
          final answer = await peer.createAnswer();
          await _retrying(() => _api.answer(callId, answer));
        }
        _adoptOrphans();
        if (r.batchLimited) again = true;
      }
      if (!again) return;
    }
  }

  /// A request the server refuses for a moment (an SDP exchange of this
  /// session is still open: 409) is repeated a few times.
  Future<T> _retrying<T>(Future<T> Function() run) async {
    for (var i = 0;; i++) {
      try {
        return await run();
      } on ApiException catch (e) {
        if (e.statusCode != 409 || i >= 3 || _closed) rethrow;
        await Future<void>.delayed(retryPause);
      }
    }
  }

  void _onTrack(int gen, String mid, MediaStreamTrack track, MediaStream s) {
    if (gen != _gen || _closed) return;
    final pull = _pulls[mid];
    if (pull == null) {
      // The track came before the answer to /subscribe told whose it is.
      _orphans[mid] = (track: track, stream: s);
      return;
    }
    _bind(pull, track, s);
  }

  void _adoptOrphans() {
    for (final mid in _orphans.keys.toList()) {
      final pull = _pulls[mid];
      final o = _orphans[mid];
      if (pull == null || o == null) continue;
      _orphans.remove(mid);
      _bind(pull, o.track, o.stream);
    }
  }

  void _bind(_Pull pull, MediaStreamTrack track, MediaStream stream) {
    final id = track.id;
    if (id != null) _trackUser[id] = pull.userId;
    if (track.kind == 'video') {
      final old = _remotes.value[pull.userId];
      // The same stream object again (the camera came back): tell the tile.
      if (identical(old, stream)) {
        _remotes.value = {..._remotes.value}..remove(pull.userId);
      }
      _remotes.value = {..._remotes.value, pull.userId: stream};
    }
    _levelTimer ??= Timer.periodic(
      levelsEvery,
      (_) => unawaited(_pollLevels()),
    );
  }

  /// Drops everything we pull of [userId]: the transceivers stop and the
  /// server closes the tracks by force (no SDP exchange needed).
  Future<void> _closeUserNow(String userId) async {
    final mids = [
      for (final e in _pulls.entries)
        if (e.value.userId == userId) e.key,
    ];
    if (mids.isEmpty) return;
    for (final m in mids) {
      _pulls.remove(m);
      _orphans.remove(m);
      try {
        await _peer?.stopMid(m);
      } on Object {
        // The transceiver is gone already.
      }
    }
    _trackUser.removeWhere((_, u) => u == userId);
    _applied.remove(userId);
    if (_remotes.value.containsKey(userId)) {
      _remotes.value = {..._remotes.value}..remove(userId);
    }
    if (_pulls.isEmpty) {
      _levelTimer?.cancel();
      _levelTimer = null;
      _speaking.value = const {};
    }
    try {
      await _api.close(callId, userIds: [userId]);
    } on Object {
      // They left; the server closed their tracks on its own.
    }
  }

  @override
  Future<void> removePeer(String peer) =>
      _serial(() => _closeUserNow(peer)).catchError((Object _) {});

  // --- Layers ---

  @override
  void setLayers(Map<String, SfuRid> wanted) {
    if (_closed) return;
    _wanted
      ..clear()
      ..addAll(wanted);
    _layerTimer?.cancel();
    _layerTimer = Timer(layerDebounce, () => unawaited(_applyLayers()));
  }

  Future<void> _applyLayers() async {
    if (_closed) return;
    try {
      await _serial(() async {
        for (final e in _pulls.entries.toList()) {
          if (e.value.trackName != kSfuCam) continue;
          final u = e.value.userId;
          final want = _wanted[u];
          if (want == null || _applied[u] == want) continue;
          await _retrying(() => _api.layer(callId, userId: u, rid: want));
          _applied[u] = want;
        }
      });
    } on Object {
      // The next layout change tries again.
    }
  }

  // --- Reconnect ---

  @override
  Future<void> reconnect() {
    if (_closed) return Future.value();
    return _reconnecting ??= _reconnectNow().whenComplete(
      () => _reconnecting = null,
    );
  }

  Future<void> _reconnectNow() async {
    final peer = _peer;
    final gen = _gen;
    if (peer == null || _peerState == CallMediaState.failed) {
      return _recreate();
    }
    if (_peerState == CallMediaState.connected) {
      // The network changed under a link that still looks fine: look for a
      // new route now rather than when the library notices.
      try {
        await peer.restartIce();
      } on Object {
        // Closing.
      }
      return;
    }
    final since = _downSince;
    if (since != null && _now().difference(since) > sessionWindow) {
      return _recreate();
    }
    try {
      await peer.setServers(_servers);
      await peer.restartIce();
    } on Object {
      return _recreate();
    }
    if (await _waitConnected(iceRestartWindow, gen)) return;
    if (_closed || gen != _gen) return;
    await _recreate();
  }

  /// Too long down (or the connection is dead): a new session, our tracks
  /// published again, everybody pulled again. The tiles blink; the call
  /// lives.
  Future<void> _recreate() async {
    for (var i = 0; i < maxRecreate; i++) {
      if (_closed) return;
      try {
        await _serial(() async {
          await _dropPeer();
          await _connect();
        });
        await _serial(_syncPulls);
        return;
      } on Object {
        if (_closed) return;
        await Future<void>.delayed(retryPause * (i + 1));
      }
    }
    if (!_closed) _onState?.call(CallMediaState.failed);
  }

  Future<void> _dropPeer() async {
    _gen++;
    _wake(false);
    final old = _peer;
    _peer = null;
    _pulls.clear();
    _orphans.clear();
    _trackUser.clear();
    _applied.clear();
    _published.clear();
    _layersNow = null;
    _remotes.value = const {};
    _speaking.value = const {};
    _levelTimer?.cancel();
    _levelTimer = null;
    _downSince = null;
    try {
      await old?.close();
    } on Object {
      // Gone already.
    }
  }

  // --- Our own tracks: mute, camera ---

  @override
  void setMuted(bool muted) {
    _mutedNow = muted;
    for (final t in _mic?.getAudioTracks() ?? const <MediaStreamTrack>[]) {
      t.enabled = !muted;
    }
  }

  @override
  Future<void> setCameraOn(bool on) async {
    for (final t in _mic?.getVideoTracks() ?? const <MediaStreamTrack>[]) {
      t.enabled = on;
    }
    _local.value = on ? _mic : null;
    _camTimer?.cancel();
    if (on) {
      if (_camClosed) await _publishCam();
    } else {
      _camTimer = Timer(cameraCloseAfter, () => unawaited(_closeCam()));
    }
  }

  /// The camera has been off for long: stop publishing it (the track stays,
  /// so switching it on again needs no new camera).
  Future<void> _closeCam() async {
    if (_closed) return;
    try {
      await _serial(() async {
        final mid = _published.remove(kSfuCam);
        if (mid == null) return;
        _camClosed = true;
        try {
          await _api.close(callId, trackNames: const [kSfuCam]);
        } finally {
          await _peer?.stopMid(mid);
        }
      });
    } on Object {
      // Offline: a new session publishes only what is wanted.
    }
  }

  /// Publishes the camera on a new transceiver of the same connection.
  Future<void> _publishCam() async {
    final cam = _camTrack;
    final mic = _mic;
    if (cam == null || mic == null || _closed) return;
    _camClosed = false;
    await _serial(() async {
      final peer = _peer;
      if (peer == null || _published.containsKey(kSfuCam)) return;
      await peer.addSend(cam, mic, simulcast: true);
      final offer = await peer.createOffer();
      final mid = sendMidsOf(offer).video;
      if (mid == null) throw StateError('the offer has no camera');
      final res = await _api.publish(
        callId,
        sdp: offer,
        trackNameByMid: {mid: kSfuCam},
      );
      await peer.setRemote('answer', res.sdp);
      final got = res.tracks.entries
          .where((e) => e.value == kSfuCam)
          .map((e) => e.key)
          .firstOrNull;
      if (got != null) _published[kSfuCam] = got;
    });
  }

  @override
  Future<void> enableVideo() async {
    final mic = _mic;
    if (mic == null) return;
    _camTimer?.cancel();
    final live = mic.getVideoTracks();
    if (live.isNotEmpty) {
      for (final t in live) {
        t.enabled = true;
      }
      _local
        ..value = null
        ..value = mic;
      if (_camClosed || !_published.containsKey(kSfuCam)) {
        await _publishCam();
      }
      return;
    }
    final cam = await _rtc.openCamera();
    await mic.addTrack(cam.getVideoTracks().first);
    _camClosed = false;
    await _publishCam();
    _local
      ..value = null
      ..value = mic;
  }

  @override
  Future<void> disableVideo() async {
    final mic = _mic;
    if (mic == null) return;
    _camTimer?.cancel();
    await _closeCam();
    for (final t in mic.getVideoTracks()) {
      await t.stop();
      await mic.removeTrack(t);
    }
    _camClosed = false;
    _local.value = null;
  }

  @override
  Future<void> switchCamera() async {
    final t = _camTrack;
    if (t == null) return;
    await _rtc.switchCamera(t);
  }

  @override
  Future<void> setSpeaker(bool on) => _rtc.setSpeaker(on);

  @override
  Future<void> updateIceServers(List<IceServer> iceServers) async {
    _turn = iceServers;
    try {
      await _peer?.setServers(_servers);
    } on Object {
      // Closing.
    }
  }

  // --- Quality and who is speaking ---

  Future<void> _pollQuality() async {
    final peer = _peer;
    if (peer == null || _closed) return;
    try {
      final stats = linkStatsFrom(await peer.getStats());
      if (stats == null) return;
      final q = _tracker.add(stats);
      if (_quality.value != q) _quality.value = q;
      final layers = sfuLayersFor(q);
      if (_published.containsKey(kSfuCam) &&
          !(_layersNow != null &&
              _layersNow!.length == layers.length &&
              _layersNow!.containsAll(layers))) {
        _layersNow = layers;
        await peer.setActiveLayers(layers);
      }
    } on Object {
      // The link is closing.
    }
  }

  Future<void> _pollLevels() async {
    final peer = _peer;
    if (peer == null || _closed) return;
    final now = <String>{};
    var self = 0.0;
    try {
      for (final r in await peer.getStats()) {
        final level = (r.values['audioLevel'] as num?)?.toDouble() ?? 0;
        if (r.type == 'inbound-rtp' && level > 0.02) {
          final mid = '${r.values['mid'] ?? ''}';
          final id = '${r.values['trackIdentifier'] ?? ''}';
          final u = _pulls[mid]?.userId ?? _trackUser[id];
          if (u != null) now.add(u);
        }
        if (r.type == 'media-source' && level > self) self = level;
      }
    } on Object {
      return;
    }
    if (self > 0.02 && !_mutedNow) now.add(kSelfSpeaker);
    final old = _speaking.value;
    if (old.length != now.length || !old.containsAll(now)) {
      _speaking.value = now;
    }
  }

  // --- Close ---

  @override
  Future<void> close() async {
    if (_closed) return;
    final peer = _peer;
    final had = _published.keys.toList();
    // Closing the tracks first (best effort): the SFU stops forwarding at
    // once; the server does the same when it hears we left.
    if (peer != null && had.isNotEmpty) {
      try {
        await _api
            .close(callId, trackNames: had)
            .timeout(const Duration(seconds: 2));
      } on Object {
        // Left already (404) or offline.
      }
    }
    _closed = true;
    _gen++;
    _wake(false);
    for (final t in [
      _camTimer,
      _layerTimer,
      _resyncTimer,
      _qualityTimer,
      _levelTimer,
    ]) {
      t?.cancel();
    }
    _camTimer = _layerTimer = _resyncTimer = _qualityTimer = _levelTimer = null;
    for (final t in _mic?.getTracks() ?? const <MediaStreamTrack>[]) {
      await t.stop();
    }
    _local.value = null;
    _remote.value = null;
    _remotes.value = const {};
    _speaking.value = const {};
    _quality.value = LinkQuality.good;
    await _mic?.dispose();
    _mic = null;
    _peer = null;
    _pulls.clear();
    _published.clear();
    try {
      await peer?.close();
    } on Object {
      // Gone already.
    }
  }

  // --- The mesh half of CallMedia: not used on an SFU call ---

  static UnsupportedError _mesh() =>
      UnsupportedError('An SFU call has one connection, not one per member.');

  @override
  Future<void> addPeer(
    String peer, {
    required void Function(Map<String, Object?> signal) onSignal,
    required void Function(CallMediaState state) onState,
  }) async {}

  @override
  Future<bool> offerPendingFor(String peer) async => false;

  @override
  Future<void> rollbackFor(String peer) async {}

  @override
  Future<Map<String, Object?>> createOffer() => throw _mesh();

  @override
  Future<Map<String, Object?>> answer(Map<String, Object?> offer) =>
      throw _mesh();

  @override
  Future<void> setAnswer(Map<String, Object?> answer) => throw _mesh();

  @override
  Future<void> addCandidate(Map<String, Object?> candidate) => throw _mesh();

  @override
  Future<Map<String, Object?>> restartIce() => throw _mesh();

  @override
  Future<Map<String, Object?>> createOfferFor(String peer) => throw _mesh();

  @override
  Future<Map<String, Object?>> answerFor(
    String peer,
    Map<String, Object?> offer,
  ) =>
      throw _mesh();

  @override
  Future<void> setAnswerFor(String peer, Map<String, Object?> answer) =>
      throw _mesh();

  @override
  Future<void> addCandidateFor(String peer, Map<String, Object?> candidate) =>
      throw _mesh();

  @override
  Future<Map<String, Object?>> restartIceFor(String peer) => throw _mesh();
}

/// A fresh SFU media per call (the controller passes the call id).
final sfuCallMediaFactoryProvider =
    Provider<SfuCallMedia Function(String callId, CallsSfuApi api)>(
  (ref) => (callId, api) => CloudflareSfuCallMedia(
        callId: callId,
        api: api,
        rtc: defaultSfuRtc(),
      ),
);
