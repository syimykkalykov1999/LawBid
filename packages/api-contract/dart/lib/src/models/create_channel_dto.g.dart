// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_channel_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateChannelDto _$CreateChannelDtoFromJson(Map<String, dynamic> json) =>
    CreateChannelDto(
      title: json['title'] as String,
      username: json['username'] as String,
      description: json['description'] as String?,
      avatarFileId: json['avatarFileId'] as String?,
      commentsEnabled: json['commentsEnabled'] as bool?,
    );

Map<String, dynamic> _$CreateChannelDtoToJson(CreateChannelDto instance) =>
    <String, dynamic>{
      'title': instance.title,
      'username': instance.username,
      'description': ?instance.description,
      'avatarFileId': ?instance.avatarFileId,
      'commentsEnabled': ?instance.commentsEnabled,
    };
