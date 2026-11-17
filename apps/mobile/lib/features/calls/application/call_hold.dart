import 'package:audio_session/audio_session.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/features/calls/domain/call_models.dart';

/// Row 216 (owner 17.11, «like WhatsApp»): who holds our call on this phone.
/// A cellular or other app's call never kills a LawBid call — it holds it,
/// and the call comes back when the other one is over.
enum CallHoldSource {
  /// The phone's call system: iOS CallKit `CXSetHeldCallAction`, Android
  /// Telecom `Connection.onHold` (flutter_callkit_incoming's
  /// `ACTION_CALL_TOGGLE_HOLD`, MIT).
  system,

  /// iOS `AVAudioSessionInterruptionNotification` began / ended
  /// (audio_session, MIT).
  interruption,

  /// Android: a cellular call took the phone's audio — the audio mode
  /// went to «in call» (`CallForegroundService`, no permission needed).
  phoneCall,
}

/// The hold state machine: held while ANY source holds it, resumed only
/// when the last one lets go (iOS reports a CallKit hold and an audio
/// interruption for the same cellular call; either may come first).
@immutable
class CallHold {
  const CallHold([this.by = const {}]);

  final Set<CallHoldSource> by;

  bool get held => by.isNotEmpty;

  /// [source] holds ([on]) or lets go.
  CallHold apply(CallHoldSource source, {required bool on}) {
    final next = {...by};
    if (on) {
      next.add(source);
    } else {
      next.remove(source);
    }
    return CallHold(next);
  }
}

/// An iOS audio interruption that begins less than this after the call
/// connected is CallKit handing the audio over, not another call.
const kCallHoldSettle = Duration(seconds: 3);

/// WhatsApp's call-waiting tone: a soft beep in the call every few seconds
/// while the second call waits (Android and the web; iOS CallKit plays its
/// own).
const kCallWaitingBeepEvery = Duration(seconds: 3);

/// iOS: `true` when an audio interruption begins, `false` when it ends
/// (audio_session, MIT — it only listens, the session is not configured
/// here). Other platforms: nothing (Android hears the cellular call through
/// the audio mode and Telecom; the web has no such thing).
final callAudioInterruptionsProvider = Provider<Stream<bool>>((ref) {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.iOS) {
    return const Stream<bool>.empty();
  }
  return Stream.fromFuture(AudioSession.instance).asyncExpand(
    (session) => session.interruptionEventStream.map((e) => e.begin),
  );
});

/// The call signal that tells the other phone (row 166 pattern, like
/// `{'type':'mute'}`); an older app ignores a type it does not know.
Map<String, Object?> holdSignal({required bool on}) => {
      'type': 'hold',
      'on': on,
    };

/// Row 216 (WhatsApp call waiting, Dec 2019): a second LawBid call that
/// rings while this phone talks in another call — the «Decline» /
/// «End & Accept» prompt.
@immutable
class CallWaiting {
  const CallWaiting({required this.call, this.systemUi = false});

  final AppCall call;

  /// The phone's own call screen shows it (iOS CallKit call waiting): the
  /// in-app prompt stays away, one ringing surface (owner 2026-10-21).
  final bool systemUi;
}

class CallWaitingNotifier extends Notifier<CallWaiting?> {
  @override
  CallWaiting? build() => null;

  // ignore: use_setters_to_change_properties
  void set(CallWaiting? value) => state = value;
}

final callWaitingProvider = NotifierProvider<CallWaitingNotifier, CallWaiting?>(
  CallWaitingNotifier.new,
);
