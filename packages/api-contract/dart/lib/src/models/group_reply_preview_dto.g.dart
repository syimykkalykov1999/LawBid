// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_reply_preview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupReplyPreviewDto _$GroupReplyPreviewDtoFromJson(
  Map<String, dynamic> json,
) => GroupReplyPreviewDto(
  id: json['id'] as String,
  type: GroupReplyPreviewDtoType.fromJson(json['type'] as String),
  snippet: json['snippet'] as String,
  deleted: json['deleted'] as bool,
  senderName: json['senderName'] as String?,
);

Map<String, dynamic> _$GroupReplyPreviewDtoToJson(
  GroupReplyPreviewDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'senderName': ?instance.senderName,
  'type': instance.type.toJson(),
  'snippet': instance.snippet,
  'deleted': instance.deleted,
};
