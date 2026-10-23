import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

/// What the `/qr` socket tells the waiting browser (docs/runbooks/
/// QR_LOGIN.md, owner 2026-10-22): the phone scanned, approved or declined
/// the code, or the code died. Never tokens — those come from
/// `POST /auth/qr/poll` with the browser's own secret.
enum QrLoginSocketEvent { scanned, approved, rejected, expired }

/// One subscription to the `/qr` namespace for one code: `io(api + '/qr',
/// {auth: {qrId}})`. Closed by [dispose]. The screen keeps its 10-second
/// poll as the fallback (a proxy without WebSocket, a dropped socket).
abstract interface class QrLoginSocket {
  Stream<QrLoginSocketEvent> get events;
  void dispose();
}

/// Opens the real socket; the factory takes the API origin and the code.
typedef QrLoginSocketFactory = QrLoginSocket Function(
  String apiBaseUrl,
  String qrId,
);

class SocketIoQrLoginSocket implements QrLoginSocket {
  SocketIoQrLoginSocket(String apiBaseUrl, String qrId) {
    final origin = Uri.parse(apiBaseUrl).replace(path: '').toString();
    final socket = io.io(
      '$origin/qr',
      io.OptionBuilder()
          // websocket first; long-polling for a proxy that blocks it.
          .setTransports(['websocket', 'polling'])
          .setAuth({'qrId': qrId})
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionAttempts(3)
          .build(),
    );
    _socket = socket;
    void on(String name, QrLoginSocketEvent e) =>
        socket.on(name, (_) => _add(e));
    on('auth:qr_scanned', QrLoginSocketEvent.scanned);
    on('auth:qr_approved', QrLoginSocketEvent.approved);
    on('auth:qr_rejected', QrLoginSocketEvent.rejected);
    on('auth:qr_expired', QrLoginSocketEvent.expired);
    socket
      ..on('auth:error', (data) {
        if (kDebugMode) debugPrint('qr socket: $data');
      })
      ..onConnectError((e) {
        // The 10-second poll carries on; nothing to show.
        if (kDebugMode) debugPrint('qr socket connect: $e');
      })
      ..connect();
  }

  io.Socket? _socket;
  final _events = StreamController<QrLoginSocketEvent>.broadcast();

  void _add(QrLoginSocketEvent e) {
    if (!_events.isClosed) _events.add(e);
  }

  @override
  Stream<QrLoginSocketEvent> get events => _events.stream;

  @override
  void dispose() {
    final s = _socket;
    _socket = null;
    if (s != null) {
      s
        ..clearListeners()
        ..dispose();
    }
    unawaited(_events.close());
  }
}
