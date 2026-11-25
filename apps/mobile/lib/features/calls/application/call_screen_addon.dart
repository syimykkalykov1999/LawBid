import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';

/// What ONE call's screen adds, drawn by the feature that opened the call
/// (owner row 87: the hotline — the client's attorney card, mockup v4 c10b;
/// the attorney's chips, «⋯» and «Клиент ждёт», mockup a4–a7). The calls
/// code does not know that feature: it only asks this slot. A call with an
/// add-on is voice only (no camera button). Every other call — every 1:1
/// and group call — is drawn as before.
@immutable
class CallScreenAddon {
  const CallScreenAddon({
    required this.callId,
    this.stage,
    this.below,
    this.banner,
    this.onMore,
    this.moreLabel = '',
  });

  final String callId;

  /// The whole middle of the screen (client side). `clock` is the call's
  /// own running time / status line.
  final Widget Function(
    BuildContext context, {
    required CallPeer? peer,
    required Widget clock,
    required double bottomInset,
  })? stage;

  /// Under the name and the status of the ordinary middle (attorney side:
  /// the topic and chips while it rings, «topic · language» while talking).
  final WidgetBuilder? below;

  /// A banner under the top line while the call is up («Клиент ждёт»).
  final WidgetBuilder? banner;

  /// «⋯» in place of «Add participant» while the call is up.
  final void Function(BuildContext context, WidgetRef ref)? onMore;
  final String moreLabel;
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
