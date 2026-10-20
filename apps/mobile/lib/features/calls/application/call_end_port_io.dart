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
    IsolateNameServer
      ..removePortNameMapping(_name)
      ..registerPortWithName(port.sendPort, _name);
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
