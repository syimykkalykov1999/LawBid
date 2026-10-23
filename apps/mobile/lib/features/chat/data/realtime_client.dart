import 'dart:async';
import 'dart:math';

import 'package:lawbid/core/config/client_tuning.dart';
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
  })  : _origin = _originOf(apiBaseUrl),
        _token = token,
        _refreshToken = refreshToken;

  final String _origin;
  final Future<String?> Function() _token;
  final Future<String?> Function() _refreshToken;
  final _events = StreamController<RealtimeEvent>.broadcast();
  final Set<String> _rooms = {};
  final Set<String> _watched = {};
  final Set<String> _channels = {};
  final Set<String> _posts = {};
  io.Socket? _socket;
  bool _everConnected = false;
  bool _disposed = false;
  int _rateLimitStrikes = 0;
  Timer? _rateLimitTimer;
  final Random _random = Random();

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

  Stream<RealtimeEvent> get events => _events.stream;

  bool get connected => _socket?.connected ?? false;

  static String _originOf(String apiBaseUrl) {
    final u = Uri.parse(apiBaseUrl);
    return u.replace(path: '').toString();
  }

  Future<void> connect() async {
    if (_disposed || _socket != null) return;
    final token = await _token();
    if (token == null || _disposed) return;
    final socket = io.io(
      '$_origin/realtime',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(ClientTuning.reconnectMinMs)
          .setReconnectionDelayMax(ClientTuning.reconnectMaxMs)
          .setRandomizationFactor(0.5)
          .build(),
    );
    _socket = socket;
    socket
      ..onConnect((_) {
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
        if (_everConnected) {
          _events.add(const RealtimeEvent(RealtimeEvent.reconnected, null));
        }
        _everConnected = true;
        _rateLimitStrikes = 0;
      })
      ..on('auth:expired', (_) => _reauth())
      ..on('auth:error', (data) {
        if (isRateLimited(data)) {
          _reconnectAfterRateLimit();
        } else {
          _reauth();
        }
      });
    for (final name in _serverEvents) {
      socket.on(name, (data) => _events.add(RealtimeEvent(name, data)));
    }
    socket.connect();
  }

  /// The access token rotated: re-check it on the live socket.
  void tokenChanged(String token) {
    final s = _socket;
    if (s == null) return;
    s.auth = {'token': token};
    if (s.connected) {
      s.emit('auth:refresh', {'token': token});
    } else if (!s.active) {
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
    _rateLimitTimer?.cancel();
    _rateLimitTimer = Timer(delay, () {
      if (_disposed || s != _socket || s.connected) return;
      s.connect();
    });
  }

  Future<void> _reauth() async {
    final s = _socket;
    if (s == null || _disposed) return;
    final token = await _refreshToken();
    if (token == null || _disposed) return;
    s
      ..auth = {'token': token}
      ..connect();
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
    _rateLimitTimer?.cancel();
    _socket
      ?..clearListeners()
      ..dispose();
    _socket = null;
    _events.close();
  }
}
