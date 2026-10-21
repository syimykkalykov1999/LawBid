// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reply_preview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReplyPreviewDto _$ReplyPreviewDtoFromJson(Map<String, dynamic> json) =>
    ReplyPreviewDto(
      id: json['id'] as String,
      type: ReplyPreviewDtoType.fromJson(json['type'] as String),
      snippet: json['snippet'] as String,
      revoked: json['revoked'] as bool,
      senderId: json['senderId'] as String?,
    );

Map<String, dynamic> _$ReplyPreviewDtoToJson(ReplyPreviewDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'senderId': ?instance.senderId,
      'type': instance.type.toJson(),
      'snippet': instance.snippet,
      'revoked': instance.revoked,
    };
