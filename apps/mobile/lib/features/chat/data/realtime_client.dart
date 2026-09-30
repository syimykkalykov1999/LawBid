import 'dart:async';

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
  io.Socket? _socket;
  bool _everConnected = false;
  bool _disposed = false;

  static const _serverEvents = [
    'message:new',
    'message:read',
    // OQ-040: the other side played a voice note.
    'message:listened',
    // OQ-041: in-app calls.
    'call:incoming',
    'call:accepted',
    'call:ended',
    'call:signal',
    'typing',
    'notification:new',
    'badge:update',
    'conversation:update',
  ];

  Stream<RealtimeEvent> get events => _events.stream;

  bool get connected => _socket?.connected ?? false;

  static String _originOf(String apiBaseUrl) {
    final u = Uri.parse(apiBaseUrl);
    return u.replace(path: '', query: null, fragment: null).toString();
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
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(30000)
          .setRandomizationFactor(0.5)
          .build(),
    );
    _socket = socket;
    socket
      ..onConnect((_) {
        for (final id in _rooms) {
          _join(id);
        }
        if (_everConnected) {
          _events.add(const RealtimeEvent(RealtimeEvent.reconnected, null));
        }
        _everConnected = true;
      })
      ..on('auth:expired', (_) => _reauth())
      ..on('auth:error', (_) => _reauth());
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
    s.emitWithAck('conversation:join', {'conversationId': conversationId},
        ack: (Object? data) {
      final ok = data is Map && data['ok'] == true;
      if (!ok && attempt < 4 && !_disposed) {
        Future<void>.delayed(Duration(milliseconds: 300 * (attempt + 1)),
            () => _join(conversationId, attempt + 1));
      }
    });
  }

  void leave(String conversationId) {
    _rooms.remove(conversationId);
    if (connected) {
      _socket!.emit('conversation:leave', {'conversationId': conversationId});
    }
  }

  void typing(String conversationId, {required bool active}) {
    if (!connected) return;
    _socket!.emit(active ? 'typing:start' : 'typing:stop',
        {'conversationId': conversationId});
  }

  /// OQ-041: WebRTC signaling (offer / answer / ICE) to the other member
  /// of a live call; false when the socket is down or the server refused.
  Future<bool> callSignal(String callId, Map<String, Object?> data) {
    final s = _socket;
    if (s == null || !s.connected) return Future.value(false);
    final done = Completer<bool>();
    s.emitWithAck('call:signal', {'callId': callId, 'data': data},
        ack: (Object? r) {
      if (!done.isCompleted) done.complete(r is Map && r['ok'] == true);
    });
    return done.future
        .timeout(const Duration(seconds: 5), onTimeout: () => false);
  }

  void dispose() {
    _disposed = true;
    _socket
      ?..clearListeners()
      ..dispose();
    _socket = null;
    _events.close();
  }
}
