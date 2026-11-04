import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Owner 2026-10-20: a source that starts making sound over a player that
/// cannot take the audio focus (a reel given its sound) calls [take]; a
/// voice note playing underneath listens and pauses.
class AudioTakeover extends Notifier<int> {
  @override
  int build() => 0;

  void take() => state++;
}

final audioTakeoverProvider =
    NotifierProvider<AudioTakeover, int>(AudioTakeover.new);

/// R-373 (owner 2026-11-04, «рилсы зависают и не играют» with a call in the
/// status bar): true while a call of ours runs. Players then open without
/// asking for the audio focus and stay silent — on Android a call holds the
/// focus, and a player that asks for it is held on its first frame. The
/// call controller keeps it up to date; nothing else writes it.
class CallAudioActive extends Notifier<bool> {
  @override
  bool build() => false;

  // ignore: use_setters_to_change_properties
  void set({required bool active}) {
    if (state != active) state = active;
  }
}

final callAudioActiveProvider =
    NotifierProvider<CallAudioActive, bool>(CallAudioActive.new);
