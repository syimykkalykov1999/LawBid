// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_group_me_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateGroupMeDto _$UpdateGroupMeDtoFromJson(Map<String, dynamic> json) =>
    UpdateGroupMeDto(
      mutedUntil: json['mutedUntil'] == null
          ? null
          : DateTime.parse(json['mutedUntil'] as String),
      pinned: json['pinned'] as bool?,
      hidden: json['hidden'] as bool?,
    );

Map<String, dynamic> _$UpdateGroupMeDtoToJson(UpdateGroupMeDto instance) =>
    <String, dynamic>{
      'mutedUntil': ?instance.mutedUntil?.toIso8601String(),
      'pinned': ?instance.pinned,
      'hidden': ?instance.hidden,
    };
