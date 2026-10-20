// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_channel_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateChannelDto _$UpdateChannelDtoFromJson(Map<String, dynamic> json) =>
    UpdateChannelDto(
      title: json['title'] as String?,
      username: json['username'] as String?,
      description: json['description'] as String?,
      avatarFileId: json['avatarFileId'] as String?,
      removeAvatar: json['removeAvatar'] as bool?,
      commentsEnabled: json['commentsEnabled'] as bool?,
    );

Map<String, dynamic> _$UpdateChannelDtoToJson(UpdateChannelDto instance) =>
    <String, dynamic>{
      'title': ?instance.title,
      'username': ?instance.username,
      'description': ?instance.description,
      'avatarFileId': ?instance.avatarFileId,
      'removeAvatar': ?instance.removeAvatar,
      'commentsEnabled': ?instance.commentsEnabled,
    };
