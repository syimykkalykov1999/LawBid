import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';

/// The middle of the voice-call screen for ONE call, drawn by the feature
/// that opened it (owner row 87: the hotline's attorney card, mockup v4
/// c10b). The calls code does not know that feature: it only asks this
/// slot. A call with an add-on is voice only (no camera button). Every
/// other call — every 1:1 and group call — is drawn as before.
@immutable
class CallScreenAddon {
  const CallScreenAddon({required this.callId, required this.stage});

  final String callId;

  /// `clock` is the call's own running time / status line.
  final Widget Function(
    BuildContext context, {
    required CallPeer? peer,
    required Widget clock,
    required double bottomInset,
  }) stage;
}

class CallScreenAddonSlot extends Notifier<CallScreenAddon?> {
  @override
  CallScreenAddon? build() => null;

  // ignore: use_setters_to_change_properties
  void set(CallScreenAddon? addon) => state = addon;
}

final callScreenAddonProvider =
    NotifierProvider<CallScreenAddonSlot, CallScreenAddon?>(
  CallScreenAddonSlot.new,
);
