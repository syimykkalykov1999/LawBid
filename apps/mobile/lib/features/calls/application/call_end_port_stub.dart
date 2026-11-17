/// Web: no background isolate — nothing to bridge.
bool sendCallEnded(String callId) => false;

void Function() listenCallEnded(void Function(String callId) onEnded) => () {};

bool sendCallWaiting(String callId) => false;

void Function() listenCallWaiting(void Function(String callId) onRing) => () {};
