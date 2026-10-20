/// Web: no background isolate — nothing to bridge.
bool sendCallEnded(String callId) => false;

void Function() listenCallEnded(void Function(String callId) onEnded) => () {};
