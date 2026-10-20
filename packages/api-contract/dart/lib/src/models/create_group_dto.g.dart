// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_group_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateGroupDto _$CreateGroupDtoFromJson(Map<String, dynamic> json) =>
    CreateGroupDto(
      title: json['title'] as String,
      memberIds: (json['memberIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      type: json['type'] == null
          ? GroupType.private
          : GroupType.fromJson(json['type'] as String),
      description: json['description'] as String?,
      avatarFileId: json['avatarFileId'] as String?,
      username: json['username'] as String?,
      joinApproval: json['joinApproval'] as bool?,
    );

Map<String, dynamic> _$CreateGroupDtoToJson(CreateGroupDto instance) =>
    <String, dynamic>{
      'title': instance.title,
      'description': ?instance.description,
      'avatarFileId': ?instance.avatarFileId,
      'type': instance.type.toJson(),
      'username': ?instance.username,
      'joinApproval': ?instance.joinApproval,
      'memberIds': instance.memberIds,
    };
