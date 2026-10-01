// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'activity_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ActivityDto _$ActivityDtoFromJson(Map<String, dynamic> json) => ActivityDto(
  id: json['id'] as String,
  membershipId: json['membershipId'] as String,
  assistantName: json['assistantName'] as String,
  action: json['action'] as String,
  createdAt: json['createdAt'] as String,
  targetType: json['targetType'] as String?,
  targetId: json['targetId'] as String?,
  summary: json['summary'] as String?,
);

Map<String, dynamic> _$ActivityDtoToJson(ActivityDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'membershipId': instance.membershipId,
      'assistantName': instance.assistantName,
      'action': instance.action,
      'targetType': ?instance.targetType,
      'targetId': ?instance.targetId,
      'summary': ?instance.summary,
      'createdAt': instance.createdAt,
    };
