// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'calendar_feed_link_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CalendarFeedLinkDto _$CalendarFeedLinkDtoFromJson(Map<String, dynamic> json) =>
    CalendarFeedLinkDto(
      url: json['url'] as String,
      webcalUrl: json['webcalUrl'] as String,
      createdAt: json['createdAt'] as String,
    );

Map<String, dynamic> _$CalendarFeedLinkDtoToJson(
  CalendarFeedLinkDto instance,
) => <String, dynamic>{
  'url': instance.url,
  'webcalUrl': instance.webcalUrl,
  'createdAt': instance.createdAt,
};
