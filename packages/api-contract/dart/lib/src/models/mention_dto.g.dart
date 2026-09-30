// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mention_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MentionDto _$MentionDtoFromJson(Map<String, dynamic> json) => MentionDto(
  username: json['username'] as String,
  userId: json['userId'] as String,
  kind: MentionKind.fromJson(json['kind'] as String),
);

Map<String, dynamic> _$MentionDtoToJson(MentionDto instance) =>
    <String, dynamic>{
      'username': instance.username,
      'userId': instance.userId,
      'kind': instance.kind.toJson(),
    };
