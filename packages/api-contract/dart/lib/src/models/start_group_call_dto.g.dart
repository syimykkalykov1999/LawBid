// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'start_group_call_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StartGroupCallDto _$StartGroupCallDtoFromJson(Map<String, dynamic> json) =>
    StartGroupCallDto(
      video: json['video'] as bool?,
      userIds: (json['userIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$StartGroupCallDtoToJson(StartGroupCallDto instance) =>
    <String, dynamic>{'video': ?instance.video, 'userIds': ?instance.userIds};
