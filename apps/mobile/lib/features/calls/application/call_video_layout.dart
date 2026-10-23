import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/features/calls/application/call_controller.dart';

/// The corner the small picture rests in.
enum PipCorner { topEnd, topStart, bottomEnd, bottomStart }

/// Owner 2026-10-21 (Telegram / WhatsApp / Zoom): which picture is big in a
/// video call, where the small one sits, whether it and the controls are
/// hidden. Kept with the call (not in a widget): it survives the screen
/// being closed and opened again, and starts afresh with every new call.
class CallVideoLayout {
  const CallVideoLayout({
    this.selfBig = false,
    this.focusId,
    this.corner = PipCorner.topEnd,
    this.pipHidden = false,
    this.controlsHidden = false,
  });

  /// 1:1: our own picture is the big one, the other person's the small one.
  final bool selfBig;

  /// Group: the person shown big (null = the grid).
  final String? focusId;

  final PipCorner corner;

  /// Our small picture is put away (a tap on the screen brings it back).
  final bool pipHidden;

  /// 1:1: buttons, names and the small picture are hidden for a clean view.
  final bool controlsHidden;

  CallVideoLayout copyWith({
    bool? selfBig,
    String? focusId,
    bool clearFocus = false,
    PipCorner? corner,
    bool? pipHidden,
    bool? controlsHidden,
  }) =>
      CallVideoLayout(
        selfBig: selfBig ?? this.selfBig,
        focusId: clearFocus ? null : (focusId ?? this.focusId),
        corner: corner ?? this.corner,
        pipHidden: pipHidden ?? this.pipHidden,
        controlsHidden: controlsHidden ?? this.controlsHidden,
      );
}

class CallVideoLayoutNotifier extends Notifier<CallVideoLayout> {
  @override
  CallVideoLayout build() {
    // A new call starts with the default view.
    ref.watch(callControllerProvider.select((s) => s.call?.id));
    return const CallVideoLayout();
  }

  /// 1:1: a tap on the small picture swaps the two.
  void swap() => state = state.copyWith(selfBig: !state.selfBig);

  /// Group: a tap on a person makes them big; on the big one, back to the grid.
  void toggleFocus(String userId) => state = state.focusId == userId
      ? state.copyWith(clearFocus: true)
      : state.copyWith(focusId: userId);

  void clearFocus() => state = state.copyWith(clearFocus: true);

  void moveTo(PipCorner corner) => state = state.copyWith(corner: corner);

  void hidePip() => state = state.copyWith(pipHidden: true);

  /// A tap on the empty screen: hide / show the controls; showing them
  /// brings a put-away small picture back too.
  void toggleControls() => state = state.controlsHidden
      ? state.copyWith(controlsHidden: false, pipHidden: false)
      : state.copyWith(controlsHidden: true);
}

final callVideoLayoutProvider =
    NotifierProvider<CallVideoLayoutNotifier, CallVideoLayout>(
  CallVideoLayoutNotifier.new,
);

/// Owner 2026-10-23 (WhatsApp / FaceTime): which camera our picture comes
/// from. A call starts on the front camera (and so does a camera turned on
/// again); every flip toggles it. Only the front picture is mirrored.
class CallFrontCamera extends Notifier<bool> {
  // Not watching the controller: it reads this provider, so a watch back
  // would be a cycle. The controller's _reset() puts it back on the front
  // camera when a call ends.
  @override
  bool build() => true;

  /// The camera was flipped (front <-> rear).
  void flip() => state = !state;

  /// A camera was opened afresh: that is the front one.
  void front() => state = true;
}

final callFrontCameraProvider =
    NotifierProvider<CallFrontCamera, bool>(CallFrontCamera.new);

/// People in the call whose camera is off (they said so over the call's
/// signalling): their tile shows the photo and a crossed-out camera instead
/// of the black picture an off camera still sends.
class CallCamerasOff extends Notifier<Set<String>> {
  @override
  Set<String> build() => const {};

  /// A new call (or the end of this one) starts from nothing known.
  void clear() {
    if (state.isNotEmpty) state = const {};
  }

  void set(String userId, {required bool on}) {
    final next = {...state};
    if (on) {
      next.remove(userId);
    } else {
      next.add(userId);
    }
    state = next;
  }
}

final callCamerasOffProvider =
    NotifierProvider<CallCamerasOff, Set<String>>(CallCamerasOff.new);
