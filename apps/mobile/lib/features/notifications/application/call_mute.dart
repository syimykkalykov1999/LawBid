import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';

/// Owner 2026-10-21 (Telegram / WhatsApp): the chats and groups whose calls
/// ring silently for me. Filled from the chat and group lists as they load
/// and from the «mute calls» switches, so a call can look it up at once.
class CallMutedChats extends Notifier<Set<String>> {
  @override
  Set<String> build() => const {};

  /// Marks [id] (a chat or a group) as muted or not.
  void mark(String id, {required bool muted}) {
    if (state.contains(id) == muted) return;
    state = muted ? {...state, id} : ({...state}..remove(id));
  }
}

final callMutedChatsProvider =
    NotifierProvider<CallMutedChats, Set<String>>(CallMutedChats.new);

/// True when an incoming call must not ring: «Calls» is off in Settings, or
/// the calls of the chat / group it comes from are muted. The call still
/// shows (a light banner, a missed-call line) — it is never lost.
bool callRingMuted(Ref ref, {String? conversationId, String? groupId}) {
  if (isCategoryMuted(ref, NotifCategory.calls)) return true;
  final id = groupId ?? conversationId;
  return id != null && ref.read(callMutedChatsProvider).contains(id);
}
