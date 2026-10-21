// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_channel_me_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateChannelMeDto _$UpdateChannelMeDtoFromJson(Map<String, dynamic> json) =>
    UpdateChannelMeDto(
      mutedUntil: json['mutedUntil'] == null
          ? null
          : DateTime.parse(json['mutedUntil'] as String),
      pinned: json['pinned'] as bool?,
      archived: json['archived'] as bool?,
      read: json['read'] as bool?,
    );

Map<String, dynamic> _$UpdateChannelMeDtoToJson(UpdateChannelMeDto instance) =>
    <String, dynamic>{
      'mutedUntil': ?instance.mutedUntil?.toIso8601String(),
      'pinned': ?instance.pinned,
      'archived': ?instance.archived,
      'read': ?instance.read,
    };
