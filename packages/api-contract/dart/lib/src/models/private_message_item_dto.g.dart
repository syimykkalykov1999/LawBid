// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'private_message_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PrivateMessageItemDto _$PrivateMessageItemDtoFromJson(
  Map<String, dynamic> json,
) => PrivateMessageItemDto(
  id: json['id'] as String,
  senderId: json['senderId'] as String?,
  type: json['type'] as String,
  createdAt: DateTime.parse(json['createdAt'] as String),
  deleted: json['deleted'] as bool,
  fileName: json['fileName'] as String?,
  durationMs: json['durationMs'] as num?,
  bodyHidden: json['bodyHidden'] as bool,
);

Map<String, dynamic> _$PrivateMessageItemDtoToJson(
  PrivateMessageItemDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'senderId': ?instance.senderId,
  'type': instance.type,
  'createdAt': instance.createdAt.toIso8601String(),
  'deleted': instance.deleted,
  'fileName': ?instance.fileName,
  'durationMs': ?instance.durationMs,
  'bodyHidden': instance.bodyHidden,
};
