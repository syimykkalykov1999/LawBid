import 'dart:isolate';
import 'dart:ui' show IsolateNameServer;

/// The main isolate listens here for "call over" pushes that the Android
/// background isolate receives (owner 2026-10-20).
const _name = 'lawbid_call_ended';

/// Background isolate: hands [callId] to the main isolate; false = nobody
/// listens (the app process is gone).
bool sendCallEnded(String callId) {
  final port = IsolateNameServer.lookupPortByName(_name);
  if (port == null) return false;
  port.send(callId);
  return true;
}

/// Main isolate: [onEnded] gets every such id; returns the cancel function.
void Function() listenCallEnded(void Function(String callId) onEnded) {
  try {
    final port = ReceivePort();
    IsolateNameServer.removePortNameMapping(_name);
    IsolateNameServer.registerPortWithName(port.sendPort, _name);
    port.listen((Object? id) {
      if (id is String) onEnded(id);
    });
    return () {
      IsolateNameServer.removePortNameMapping(_name);
      port.close();
    };
  } on Object {
    return () {};
  }
}

/// Row 216: the main isolate listens here only while it holds a call — an
/// Android ring push the background isolate gets then is a waiting call
/// for the main isolate, not a new system ring.
const _waitingName = 'lawbid_call_waiting';

/// Background isolate: true when a call holds the main isolate and took
/// [callId] (nothing to ring here).
bool sendCallWaiting(String callId) {
  final port = IsolateNameServer.lookupPortByName(_waitingName);
  if (port == null) return false;
  port.send(callId);
  return true;
}

/// Main isolate, while in a call: [onRing] gets every such id; returns the
/// cancel function.
void Function() listenCallWaiting(void Function(String callId) onRing) {
  try {
    final port = ReceivePort();
    IsolateNameServer.removePortNameMapping(_waitingName);
    IsolateNameServer.registerPortWithName(port.sendPort, _waitingName);
    port.listen((Object? id) {
      if (id is String) onRing(id);
    });
    return () {
      IsolateNameServer.removePortNameMapping(_waitingName);
      port.close();
    };
  } on Object {
    return () {};
  }
}
