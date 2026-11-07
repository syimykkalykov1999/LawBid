import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';

/// Owner 2026-10-22 (R-007): the short sound when the other person turns
/// their video on during a call can be switched off. On by default; kept on
/// the phone like the other local choices (WhatsApp keeps its in-call
/// sounds as a per-phone setting too).
class CallVideoSound extends Notifier<bool> {
  static const _key = 'calls.video_sound';

  @override
  bool build() {
    try {
      return ref.read(localKvStoreProvider).getString(_key) != 'off';
    } on Object {
      return true;
    }
  }

  Future<void> set({required bool on}) async {
    state = on;
    try {
      await ref.read(localKvStoreProvider).setString(_key, on ? 'on' : 'off');
    } on Object {
      // Kept for this run at least.
    }
  }
}

final callVideoSoundProvider =
    NotifierProvider<CallVideoSound, bool>(CallVideoSound.new);
