// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_group_mls_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateGroupMlsDto _$CreateGroupMlsDtoFromJson(Map<String, dynamic> json) =>
    CreateGroupMlsDto(
      deviceId: json['deviceId'] as String,
      groupId: json['groupId'] as String,
      groupInfo: json['groupInfo'] as String?,
      groupInfoFileId: json['groupInfoFileId'] as String?,
    );

Map<String, dynamic> _$CreateGroupMlsDtoToJson(CreateGroupMlsDto instance) =>
    <String, dynamic>{
      'groupInfo': ?instance.groupInfo,
      'groupInfoFileId': ?instance.groupInfoFileId,
      'deviceId': instance.deviceId,
      'groupId': instance.groupId,
    };
