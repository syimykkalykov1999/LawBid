import 'dart:async';
import 'dart:math';

import 'package:lawbid/core/realtime/missed_poller.dart';
import 'package:lawbid/core/realtime/realtime_timings.dart';
import 'package:lawbid/core/realtime/reconnect_controller.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

/// A server event (docs/05 §8.5): `message:new`, `message:read`, `typing`,
/// `notification:new`, `badge:update`, `conversation:update`, and the
/// local `reconnected` (fetch what was missed over REST).
class RealtimeEvent {
  const RealtimeEvent(this.name, this.data);

  final String name;
  final Object? data;

  static const reconnected = 'reconnected';
}

/// Socket.IO at `/realtime` (docs/05 §8.5): access token at the handshake,
/// `auth:refresh` when it rotates, automatic reconnection with exponential
/// backoff. Realtime only delivers — after a reconnect listeners re-read
/// from REST instead of trusting delivery.
class RealtimeClient {
  RealtimeClient({
    required String apiBaseUrl,
    required Future<String?> Function() token,
    required Future<String?> Function() refreshToken,
    RealtimeTimings Function()? timings,
    Future<void> Function()? ensureFreshToken,
    Future<Map<String, Object?>?> Function(int since)? fetchMissed,
  })  : _origin = _originOf(apiBaseUrl),
        _token = token,
        _refreshToken = refreshToken,
        _timings = timings ?? (() => const RealtimeTimings()),
        _ensureFreshToken = ensureFreshToken,
        _fetchMissed = fetchMissed {
    _policy = ReconnectController(
      timings: _timings,
      isConnected: () => connected,
      attempt: () => unawaited(_reopen()),
    );
    _poller = MissedPoller(
      interval: () =>
          Duration(seconds: _timings().pollingFallbackIntervalSeconds),
      canPoll: () => !_disposed && !_policy.paused && !connected,
      poll: _pollMissed,
    );
  }

  final String _origin;
  final Future<String?> Function() _token;
  final Future<String?> Function() _refreshToken;
  final RealtimeTimings Function() _timings;
  final Future<void> Function()? _ensureFreshToken;

  /// `GET /realtime/missed?since=` (the same answer as `sync:since`), used
  /// when the socket does not answer.
  final Future<Map<String, Object?>?> Function(int since)? _fetchMissed;
  late final ReconnectController _policy;
  late final MissedPoller _poller;
  final _events = StreamController<RealtimeEvent>.broadcast();
  final Set<String> _rooms = {};
  final Set<String> _watched = {};
  final Set<String> _channels = {};
  final Set<String> _posts = {};
  io.Socket? _socket;
  bool _everConnected = false;
  bool _disposed = false;
  int _rateLimitStrikes = 0;
  final Random _random = Random();
  bool _socketPolling = false;
  bool _reauthing = false;
  String? _lastSentToken;
  int? _lastSeq;
  DateTime? _lastReconnectedAt;
  Timer? _trailingReconnected;
  Timer? _syncTimer;

  /// Owner 2026-10-23: a reconnect tells the screens at most once per this
  /// long (`reconnectedDebounceSeconds`; a flapping network must not make
  /// every list re-read each time).
  Duration get minReconnectedGap =>
      Duration(seconds: _timings().reconnectedDebounceSeconds);

  /// How long the server gets to answer `sync:since` before the screens
  /// are told to catch up over REST instead.
  static const syncTimeout = Duration(seconds: 3);

  static const _serverEvents = [
    'message:new',
    // Owner 2026-10-20: edited, deleted for all, reaction, pin.
    'message:updated',
    'message:read',
    // Owner 2026-10-22 (load audit finding 2): I read a chat (any device).
    'conversation:read',
    // Owner 2026-10-20: the message reached the other device (grey ticks).
    'message:delivered',
    // OQ-040: the other side played a voice note.
    'message:listened',
    // OQ-041: in-app calls.
    'call:incoming',
    'call:accepted',
    'call:ended',
    'call:signal',
    // Group calls: member list, host muted you, host removed you.
    'call:participants',
    'call:muted',
    'call:removed',
    'call:vote',
    'call:invite',
    // Owner 2026-10-22 (load audit finding 3): a group's / an open
    // channel's call started, changed or ended (no polling).
    'call:ongoing',
    'call:ongoing_ended',
    'typing',
    'notification:new',
    // Owner 2026-10-24: somebody opened a file of mine («Просмотры»).
    'file:viewed',
    'badge:update',
    'conversation:update',
    // Owner 2026-10-01: a chat partner came online / left.
    'presence:update',
    // Owner 2026-10-20: group chats and polls.
    'group:message',
    'group:update',
    'group:invite',
    'group:member_removed',
    'poll:update',
    // Owner 2026-10-22 (client economy plan, packages E / F): a case or a
    // consultation changed (re-read one card), a channel posted, a comment
    // under an open post.
    'case:update',
    'consultation:update',
    'channel:post',
    'channel:update',
    'comment:new',
  ];

  /// Owner 2026-10-23 (part C2): `reconnected` reaches each listener after
  /// its own random 0-3 s, so a dozen screens do not all hit the server in
  /// the same instant after a break.
  Stream<RealtimeEvent> get events => spreadEvents<RealtimeEvent>(
        _events.stream,
        isTarget: (e) => e.name == RealtimeEvent.reconnected,
        maxDelay: Duration(milliseconds: _timings().refetchJitterMs),
        random: _random,
      );

  bool get connected => _socket?.connected ?? false;

  static String _originOf(String apiBaseUrl) {
    final u = Uri.parse(apiBaseUrl);
    return u.replace(path: '').toString();
  }

  Future<void> connect() async {
    if (_disposed || _socket != null) return;
    await _open();
  }

  /// Builds the socket (a fresh one each time the transport set changes).
  /// Socket.IO's own reconnection is off: [_policy] decides when to retry
  /// (backoff with jitter, going-away, resume, network back).
  Future<void> _open() async {
    final token = await _token();
    if (token == null || _disposed) return;
    final old = _socket;
    if (old != null) {
      old
        ..clearListeners()
        ..dispose();
    }
    final polling = _policy.usePolling;
    _socketPolling = polling;
    final socket = io.io(
      '$_origin/realtime',
      io.OptionBuilder()
          .setTransports(polling ? ['polling', 'websocket'] : ['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .disableReconnection()
          .enableForceNew()
          .build(),
    );
    _socket = socket;
    socket
      ..onConnect((_) {
        _policy.onConnected();
        _poller.stop();
        _reauthing = false;
        for (final id in _rooms) {
          _join(id);
        }
        for (final id in _watched) {
          s0(socket, id);
        }
        for (final id in _channels) {
          socket.emit('channel:watch', {'channelId': id});
        }
        for (final id in _posts) {
          socket.emit('post:watch', {'postId': id});
        }
        if (_everConnected) _catchUpAfterReconnect(socket);
        _everConnected = true;
        _rateLimitStrikes = 0;
      })
      ..onDisconnect((reason) {
        if (reason == 'io client disconnect' || _reauthing) return;
        _policy.onFailure(serverClosed: reason == 'io server disconnect');
        _poller.start();
      })
      ..onConnectError((_) {
        if (_reauthing) return;
        _policy.onFailure();
        _poller.start();
      })
      ..on('server:going-away', (data) {
        final ms = data is Map ? data['retryAfterMs'] : null;
        _policy.onGoingAway(Duration(milliseconds: ms is num ? ms.toInt() : 0));
      })
      // docs/runbooks/REALTIME_LIFECYCLE.md: `{seq, serverTime,
      // authExpiresAt}` right after every connect; the first seq is the
      // cursor for the first catch-up.
      ..on('realtime:ready', (data) {
        if (data is Map && data['seq'] is int && _lastSeq == null) {
          _lastSeq = data['seq'] as int;
        }
      })
      ..on('auth:expiring', (_) => unawaited(_renewToken()))
      ..on('auth:expired', (_) => _reauth())
      ..on('auth:error', (data) {
        if (isRateLimited(data)) {
          _reconnectAfterRateLimit();
        } else {
          _reauth();
        }
      });
    for (final name in _serverEvents) {
      socket.on(name, (data) {
        _noteSeq(data);
        _events.add(RealtimeEvent(name, data));
      });
    }
    socket.connect();
  }

  /// The policy's "try now": a socket with the other transport set is
  /// rebuilt, otherwise the same one reconnects with the newest token.
  Future<void> _reopen() async {
    if (_disposed) return;
    final s = _socket;
    if (s == null || _socketPolling != _policy.usePolling) {
      await _open();
      return;
    }
    final token = await _token();
    if (_disposed || s != _socket || s.connected) return;
    if (token != null) s.auth = {'token': token};
    s.connect();
  }

  // --- sequence / catch-up (part C2) ---------------------------------------

  void _noteSeq(Object? data) {
    if (data is! Map) return;
    final seq = data['seq'];
    if (seq is int && seq > (_lastSeq ?? -1)) _lastSeq = seq;
  }

  /// After a reconnect: ask the server for what was missed since the last
  /// `seq` seen (`sync:since {seq}`, else `GET /realtime/missed?since=`).
  /// The answer `{seq, events: [{seq, event, data, truncated}], complete}`
  /// is replayed in order as if the events had arrived live (a `seq` at or
  /// below the cursor is dropped). `complete: false`, a `truncated` event,
  /// or no answer at all: the screens are told ONCE to catch up themselves
  /// (`reconnected`, then `updatedSince` deltas).
  void _catchUpAfterReconnect(io.Socket socket) {
    final seq = _lastSeq;
    if (seq == null) {
      _announceReconnected();
      return;
    }
    var answered = false;
    void viaHttp() {
      final fetch = _fetchMissed;
      if (fetch == null) {
        _announceReconnected();
        return;
      }
      fetch(seq).then((r) {
        if (_disposed) return;
        if (r == null) {
          _announceReconnected();
        } else {
          _applyMissed(seq, r);
        }
      }).catchError((Object _) => _announceReconnected());
    }

    _syncTimer?.cancel();
    _syncTimer = Timer(syncTimeout, () {
      if (answered || _disposed) return;
      answered = true;
      viaHttp();
    });
    socket.emitWithAck(
      'sync:since',
      {'seq': seq},
      ack: (Object? data) {
        if (answered || _disposed) return;
        answered = true;
        _syncTimer?.cancel();
        if (data is Map && data['events'] is List && data['ok'] != false) {
          _applyMissed(seq, Map<String, Object?>.from(data));
        } else {
          viaHttp();
        }
      },
    );
  }

  /// One tick of the polling fallback: the same catch-up as after a
  /// reconnect, over HTTP only, from the newest `seq` seen. No cursor yet
  /// (never connected) or no answer: nothing to do, the next tick retries.
  Future<void> _pollMissed() async {
    final since = _lastSeq;
    final fetch = _fetchMissed;
    if (since == null || fetch == null) return;
    final r = await fetch(since);
    if (_disposed || r == null || connected) return;
    _applyMissed(since, r);
  }

  void _applyMissed(int since, Map<String, Object?> answer) {
    if (answer['complete'] == false || answer['events'] is! List) {
      final top = answer['seq'];
      if (top is int && top > (_lastSeq ?? -1)) _lastSeq = top;
      _announceReconnected();
      return;
    }
    var refreshAll = false;
    for (final raw in answer['events']! as List) {
      if (raw is! Map) continue;
      final evSeq = raw['seq'];
      if (evSeq is int && evSeq <= since) continue;
      final name = raw['event'] ?? raw['name'];
      if (name is! String) continue;
      if (raw['truncated'] == true) {
        refreshAll = true;
        continue;
      }
      _noteSeq(raw);
      _noteSeq(raw['data']);
      _events.add(RealtimeEvent(name, raw['data']));
    }
    final top = answer['seq'];
    if (top is int && top > (_lastSeq ?? -1)) _lastSeq = top;
    if (refreshAll) _announceReconnected();
  }

  /// `reconnected` at most once per [minReconnectedGap]; a second one inside
  /// the gap becomes one trailing event at its end.
  void _announceReconnected() {
    if (_disposed) return;
    final last = _lastReconnectedAt;
    final now = DateTime.now();
    if (last != null && now.difference(last) < minReconnectedGap) {
      if (_trailingReconnected?.isActive ?? false) return;
      _trailingReconnected = Timer(
        minReconnectedGap - now.difference(last),
        _announceReconnected,
      );
      return;
    }
    _lastReconnectedAt = now;
    _events.add(const RealtimeEvent(RealtimeEvent.reconnected, null));
  }

  // --- lifecycle / network (part C9) ---------------------------------------

  /// The app went to the background: keep the socket, stop the timers.
  void pause() {
    _policy.pause();
    _poller.stop();
  }

  /// The app came back: renew the token if it is about to end, then
  /// reconnect at once when the socket is down.
  Future<void> resume() async {
    if (_disposed) return;
    try {
      await _ensureFreshToken?.call();
    } on Object {
      // The reconnect below still tries with whatever token there is.
    }
    if (_disposed) return;
    if (_socket == null) {
      await connect();
      return;
    }
    _policy.resume();
    if (!connected) _poller.start();
  }

  /// The network came back: reconnect at once when the socket is down.
  Future<void> networkBack() async {
    if (_disposed) return;
    if (_socket == null) {
      await connect();
      return;
    }
    _policy.networkBack();
  }

  Future<void> _renewToken() async {
    final token = await _refreshToken();
    if (token != null && !_disposed) tokenChanged(token);
  }

  /// The access token rotated: re-check it on the live socket.
  void tokenChanged(String token) {
    final s = _socket;
    if (s == null) return;
    s.auth = {'token': token};
    if (s.connected) {
      if (token == _lastSentToken) return;
      _lastSentToken = token;
      // Owner 2026-10-23: the server may answer or not (an older one just
      // keeps its `auth:expired` path); nothing waits on the answer.
      s.emitWithAck(
        'auth:refresh',
        {'accessToken': token, 'token': token},
        ack: (Object? _) {},
      );
    } else if (!s.active && !_policy.paused) {
      s.connect();
    }
  }

  /// Security research #5 (2026-10-22), A5: the server disconnects a socket
  /// that sends more than its share of packets (`auth:error
  /// { code: 'RATE_LIMITED' }`). The token is fine — do not refresh it —
  /// and never reconnect in a tight loop: wait longer each time.
  static bool isRateLimited(Object? data) =>
      data is Map && data['code'] == 'RATE_LIMITED';

  /// The wait before the [strike]-th reconnect after a `RATE_LIMITED`:
  /// 5 s, 10 s, 20 s, 40 s, then a minute, ±25 % so many phones do not
  /// come back at the same second.
  static Duration rateLimitDelay(int strike, {double jitter = 0}) {
    final base = min(5000 * pow(2, strike).toInt(), 60000);
    final j = (base * 0.25 * jitter.clamp(-1.0, 1.0)).round();
    return Duration(milliseconds: base + j);
  }

  void _reconnectAfterRateLimit() {
    final s = _socket;
    if (s == null || _disposed) return;
    final delay = rateLimitDelay(
      _rateLimitStrikes,
      jitter: _random.nextDouble() * 2 - 1,
    );
    _rateLimitStrikes++;
    // The policy holds every other retry until this wait is over.
    _policy.onGoingAway(delay);
  }

  Future<void> _reauth() async {
    final s = _socket;
    if (s == null || _disposed) return;
    _reauthing = true;
    final token = await _refreshToken();
    if (token == null || _disposed) {
      _reauthing = false;
      if (!_disposed) _policy.onFailure();
      return;
    }
    s.auth = {'token': token};
    _reauthing = false;
    if (!s.connected) s.connect();
  }

  void join(String conversationId) {
    _rooms.add(conversationId);
    if (connected) _join(conversationId);
  }

  /// The server may still be finishing the handshake: a refused join is
  /// retried shortly (review finding).
  void _join(String conversationId, [int attempt = 0]) {
    final s = _socket;
    if (s == null || !s.connected || !_rooms.contains(conversationId)) return;
    s.emitWithAck(
      'conversation:join',
      {'conversationId': conversationId},
      ack: (Object? data) {
        final ok = data is Map && data['ok'] == true;
        if (!ok && attempt < 4 && !_disposed) {
          Future<void>.delayed(
            Duration(milliseconds: 300 * (attempt + 1)),
            () => _join(conversationId, attempt + 1),
          );
        }
      },
    );
  }

  void s0(io.Socket s, String userId) =>
      s.emit('presence:watch', {'userId': userId});

  /// Owner 2026-10-01: follow [userId]'s online / last seen while a chat
  /// with them is open. Answers the current state (null = not shown).
  Future<Map<String, Object?>?> watchPresence(String userId) {
    _watched.add(userId);
    final s = _socket;
    if (s == null || !s.connected) return Future.value();
    final done = Completer<Map<String, Object?>?>();
    s.emitWithAck(
      'presence:watch',
      {'userId': userId},
      ack: (Object? r) {
        if (done.isCompleted) return;
        done.complete(r is Map ? Map<String, Object?>.from(r) : null);
      },
    );
    return done.future
        .timeout(const Duration(seconds: 5), onTimeout: () => null);
  }

  void unwatchPresence(String userId) {
    _watched.remove(userId);
    if (connected) _socket!.emit('presence:unwatch', {'userId': userId});
  }

  /// Owner 2026-10-22 (load audit finding 3): hear this channel's call
  /// start / change / end while it is open (re-sent after a reconnect).
  void watchChannel(String channelId) {
    _channels.add(channelId);
    if (connected) _socket!.emit('channel:watch', {'channelId': channelId});
  }

  void unwatchChannel(String channelId) {
    _channels.remove(channelId);
    if (connected) {
      _socket!.emit('channel:unwatch', {'channelId': channelId});
    }
  }

  /// Package F: hear new comments under [postId] while it is open
  /// (`comment:new`; re-sent after a reconnect).
  void watchPost(String postId) {
    _posts.add(postId);
    if (connected) _socket!.emit('post:watch', {'postId': postId});
  }

  void unwatchPost(String postId) {
    _posts.remove(postId);
    if (connected) _socket!.emit('post:unwatch', {'postId': postId});
  }

  void leave(String conversationId) {
    _rooms.remove(conversationId);
    if (connected) {
      _socket!.emit('conversation:leave', {'conversationId': conversationId});
    }
  }

  /// [voice]: «recording a voice message…» instead of «typing…» (owner
  /// 2026-10-20); the server relays it as `kind: text | voice`.
  void typing(
    String conversationId, {
    required bool active,
    bool voice = false,
  }) {
    if (!connected) return;
    _socket!.emit(
      active ? 'typing:start' : 'typing:stop',
      {'conversationId': conversationId, if (voice) 'kind': 'voice'},
    );
  }

  /// OQ-041: WebRTC signaling (offer / answer / ICE) to the other member
  /// of a live call (group calls: to [to], or all the others when null);
  /// false when the socket is down or the server refused.
  Future<bool> callSignal(
    String callId,
    Map<String, Object?> data, {
    String? to,
  }) {
    final s = _socket;
    if (s == null || !s.connected) return Future.value(false);
    final done = Completer<bool>();
    s.emitWithAck(
      'call:signal',
      {'callId': callId, 'data': data, if (to != null) 'to': to},
      ack: (Object? r) {
        if (!done.isCompleted) done.complete(r is Map && r['ok'] == true);
      },
    );
    return done.future
        .timeout(const Duration(seconds: 5), onTimeout: () => false);
  }

  void dispose() {
    _disposed = true;
    _trailingReconnected?.cancel();
    _syncTimer?.cancel();
    _poller.stop();
    _policy.dispose();
    _socket
      ?..clearListeners()
      ..dispose();
    _socket = null;
    _events.close();
  }
}
