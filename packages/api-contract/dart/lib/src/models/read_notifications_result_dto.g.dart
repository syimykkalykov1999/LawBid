// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'read_notifications_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReadNotificationsResultDto _$ReadNotificationsResultDtoFromJson(
  Map<String, dynamic> json,
) => ReadNotificationsResultDto(
  updated: json['updated'] as num,
  readIds: (json['readIds'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$ReadNotificationsResultDtoToJson(
  ReadNotificationsResultDto instance,
) => <String, dynamic>{
  'updated': instance.updated,
  'readIds': ?instance.readIds,
};
