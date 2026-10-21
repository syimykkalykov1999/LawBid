// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conversation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConversationDto _$ConversationDtoFromJson(
  Map<String, dynamic> json,
) => ConversationDto(
  id: json['id'] as String,
  status: ConversationDtoStatus.fromJson(json['status'] as String),
  contactsUnlocked: json['contactsUnlocked'] as bool,
  counterpart: ConversationCounterpartDto.fromJson(
    json['counterpart'] as Map<String, dynamic>,
  ),
  unreadCount: json['unreadCount'] as num,
  callsMuted: json['callsMuted'] as bool,
  updatedAt: DateTime.parse(json['updatedAt'] as String),
  folder: ChatFolder.fromJson(json['folder'] as String),
  folderAuto: json['folderAuto'] as bool,
  kind: ConversationKind.fromJson(json['kind'] as String),
  requestStatus: MessageRequestStatus.fromJson(json['requestStatus'] as String),
  requestedByMe: json['requestedByMe'] as bool,
  blocked: json['blocked'] as bool,
  caseId: json['caseId'] as String?,
  caseTitle: json['caseTitle'] as String?,
  lastMessage: json['lastMessage'] == null
      ? null
      : MessageDto.fromJson(json['lastMessage'] as Map<String, dynamic>),
  lastMessageAt: json['lastMessageAt'] == null
      ? null
      : DateTime.parse(json['lastMessageAt'] as String),
  disappearAfterS: json['disappearAfterS'] as num?,
  mutedUntil: json['mutedUntil'] == null
      ? null
      : DateTime.parse(json['mutedUntil'] as String),
  counterpartLastReadMessageId: json['counterpartLastReadMessageId'] as String?,
  counterpartLastReadAt: json['counterpartLastReadAt'] == null
      ? null
      : DateTime.parse(json['counterpartLastReadAt'] as String),
  counterpartLastDeliveredMessageId:
      json['counterpartLastDeliveredMessageId'] as String?,
  matchedMessage: json['matchedMessage'] as String?,
  waitingSince: json['waitingSince'] == null
      ? null
      : DateTime.parse(json['waitingSince'] as String),
  note: json['note'] as String?,
  pinnedAt: json['pinnedAt'] == null
      ? null
      : DateTime.parse(json['pinnedAt'] as String),
);

Map<String, dynamic> _$ConversationDtoToJson(
  ConversationDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'caseId': ?instance.caseId,
  'caseTitle': ?instance.caseTitle,
  'status': instance.status.toJson(),
  'contactsUnlocked': instance.contactsUnlocked,
  'counterpart': instance.counterpart.toJson(),
  'lastMessage': ?instance.lastMessage?.toJson(),
  'lastMessageAt': ?instance.lastMessageAt?.toIso8601String(),
  'unreadCount': instance.unreadCount,
  'disappearAfterS': ?instance.disappearAfterS,
  'mutedUntil': ?instance.mutedUntil?.toIso8601String(),
  'callsMuted': instance.callsMuted,
  'counterpartLastReadMessageId': ?instance.counterpartLastReadMessageId,
  'counterpartLastReadAt': ?instance.counterpartLastReadAt?.toIso8601String(),
  'counterpartLastDeliveredMessageId':
      ?instance.counterpartLastDeliveredMessageId,
  'updatedAt': instance.updatedAt.toIso8601String(),
  'folder': instance.folder.toJson(),
  'folderAuto': instance.folderAuto,
  'matchedMessage': ?instance.matchedMessage,
  'waitingSince': ?instance.waitingSince?.toIso8601String(),
  'note': ?instance.note,
  'pinnedAt': ?instance.pinnedAt?.toIso8601String(),
  'kind': instance.kind.toJson(),
  'requestStatus': instance.requestStatus.toJson(),
  'requestedByMe': instance.requestedByMe,
  'blocked': instance.blocked,
};
