import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/data/chat_extras_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-21 (Instagram «Поделиться»): where the share sheet sends
/// a post. A chat gets a post card (never masked, the server checks the
/// post) and the note as a text after it; a group and a channel get the
/// link as a text (their own message kinds have no post card yet).
abstract interface class PostShareSender {
  Future<void> toChat(String conversationId, String postId, {String? note});

  Future<void> toGroup(api.GroupDto group, String link, {String? note});

  Future<void> toChannel(String channelId, String link, {String? note});
}

/// The note above the link (or the link alone).
String sharedLinkText(String link, String? note) {
  final n = note?.trim() ?? '';
  return n.isEmpty ? link : '$n\n$link';
}

class _RepoPostShareSender implements PostShareSender {
  _RepoPostShareSender(this.ref);

  final Ref ref;

  @override
  Future<void> toChat(
    String conversationId,
    String postId, {
    String? note,
  }) async {
    await ref
        .read(chatExtrasRepositoryProvider)
        .sendPost(conversationId, newClientMessageId(), postId);
    final n = note?.trim() ?? '';
    if (n.isNotEmpty) {
      await ref
          .read(chatRepositoryProvider)
          .send(conversationId, newClientMessageId(), n);
    }
  }

  @override
  Future<void> toGroup(api.GroupDto group, String link, {String? note}) =>
      ref.read(groupRepositoryProvider).send(
            group.id,
            api.SendGroupMessageDto(
              clientMessageId: newClientMessageId(),
              type: api.SendGroupMessageDtoType.text,
              body: sharedLinkText(link, note),
              topicId: group.topicsEnabled ? group.generalTopicId : null,
            ),
          );

  @override
  Future<void> toChannel(String channelId, String link, {String? note}) => ref
      .read(channelsRepositoryProvider)
      .createPost(channelId, body: sharedLinkText(link, note));
}

final postShareSenderProvider = Provider<PostShareSender>(
  _RepoPostShareSender.new,
);
