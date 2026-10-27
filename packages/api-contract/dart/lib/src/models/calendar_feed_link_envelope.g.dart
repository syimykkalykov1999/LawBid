// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'calendar_feed_link_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CalendarFeedLinkEnvelope _$CalendarFeedLinkEnvelopeFromJson(
  Map<String, dynamic> json,
) => CalendarFeedLinkEnvelope(
  data: CalendarFeedLinkDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CalendarFeedLinkEnvelopeToJson(
  CalendarFeedLinkEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
