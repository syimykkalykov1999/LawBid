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
