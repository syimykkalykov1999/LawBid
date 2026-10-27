// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'calendar_feed_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CalendarFeedStatusDto _$CalendarFeedStatusDtoFromJson(
  Map<String, dynamic> json,
) => CalendarFeedStatusDto(
  enabled: json['enabled'] as bool,
  hasLink: json['hasLink'] as bool,
  createdAt: json['createdAt'] as String?,
  lastUsedAt: json['lastUsedAt'] as String?,
);

Map<String, dynamic> _$CalendarFeedStatusDtoToJson(
  CalendarFeedStatusDto instance,
) => <String, dynamic>{
  'enabled': instance.enabled,
  'hasLink': instance.hasLink,
  'createdAt': ?instance.createdAt,
  'lastUsedAt': ?instance.lastUsedAt,
};
