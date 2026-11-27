// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'chat_attachment_dto.dart';
import 'group_message_dto_type.dart';
import 'group_person_dto.dart';
import 'group_reply_preview_dto.dart';
import 'poll_dto.dart';
import 'reaction_dto.dart';
import 'voice_note_dto.dart';

part 'group_message_dto.g.dart';

@JsonSerializable()
class GroupMessageDto {
  const GroupMessageDto({
    required this.id,
    required this.groupId,
    required this.type,
    required this.body,
    required this.mine,
    required this.clientMessageId,
    required this.mentions,
    required this.mentionsMe,
    required this.deleted,
    required this.createdAt,
    this.topicId,
    this.sender,
    this.systemKind,
    this.systemPeople,
    this.systemText,
    this.replyTo,
    this.attachment,
    this.voice,
    this.poll,
    this.editedAt,
    this.expiresAt,
    this.forwarded,
    this.forwardedFrom,
    this.reactions,
    this.ciphertext,
    this.mlsEpoch,
    this.senderDeviceId,
    this.frankingTag,
    this.blobUrl,
    this.control,
  });

  factory GroupMessageDto.fromJson(Map<String, Object?> json) =>
      _$GroupMessageDtoFromJson(json);

  final String id;
  final String groupId;

  /// Forum groups: the topic; null = «General».
  final String? topicId;
  final GroupMessageDtoType type;
  final GroupPersonDto? sender;

  /// Empty for system / poll / deleted messages.
  final String body;
  final bool mine;
  final String clientMessageId;

  /// System messages: created | added | removed | left | joined | renamed | photo | description | promoted | demoted | pinned | poll_closed | disappearing (systemText = seconds, "0" = off) | protect_content (systemText "1" on / "0" off).
  final String? systemKind;

  /// System messages: who acted (first) and who it concerned.
  final List<GroupPersonDto>? systemPeople;

  /// System messages: the new title (renamed / created).
  final String? systemText;
  final GroupReplyPreviewDto? replyTo;
  final List<GroupPersonDto> mentions;

  /// I am @mentioned.
  final bool mentionsMe;
  final ChatAttachmentDto? attachment;
  final VoiceNoteDto? voice;
  final PollDto? poll;
  final DateTime? editedAt;

  /// Deleted for everyone.
  final bool deleted;
  final DateTime createdAt;

  /// Disappearing messages: when the message goes; the app hides it from this time on. Null = stays.
  final DateTime? expiresAt;

  /// Forwarded («Forwarded from …»).
  final bool? forwarded;

  /// The first author (or channel) of a forwarded message.
  final String? forwardedFrom;

  /// Emoji reactions, in the order they were first chosen.
  final List<ReactionDto>? reactions;

  /// type=mls: base64 MLS PrivateMessage; the app decrypts it. Null for other types.
  final String? ciphertext;

  /// type=mls: the epoch of the message.
  final num? mlsEpoch;

  /// type=mls: the sending MLS device.
  final String? senderDeviceId;

  /// type=mls (message franking): base64 HMAC-SHA256(k, P) the sender stored.
  final String? frankingTag;

  /// type=mls with an encrypted file: a short link to the file's ciphertext (its key is inside the message).
  final String? blobUrl;

  /// type=mls: a control message (reaction, vote, edit, poll close inside MLS): the app applies it to the message it names and shows no row.
  final bool? control;

  Map<String, Object?> toJson() => _$GroupMessageDtoToJson(this);
}
