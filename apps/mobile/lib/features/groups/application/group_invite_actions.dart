import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-21: answers a group invitation and refreshes everything it
/// touches (the cards, the Requests badge, my groups). Returns the joined
/// group's id on «Accept», null on «Decline». Errors reach the caller.
Future<String?> answerGroupInvite(
  WidgetRef ref,
  String inviteId, {
  required bool accept,
}) async {
  final repo = ref.read(groupRepositoryProvider);
  String? joined;
  if (accept) {
    final result = await repo.acceptInvite(inviteId);
    if (result.status == api.GroupJoinResultDtoStatus.joined) {
      joined = result.groupId;
    }
  } else {
    await repo.declineInvite(inviteId);
  }
  ref
    ..invalidate(groupInvitesProvider)
    ..invalidate(groupsProvider)
    ..invalidate(messageRequestsCountProvider)
    ..invalidate(chatFolderCountsProvider);
  return joined;
}
