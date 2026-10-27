// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'calendar_feed_status_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CalendarFeedStatusEnvelope _$CalendarFeedStatusEnvelopeFromJson(
  Map<String, dynamic> json,
) => CalendarFeedStatusEnvelope(
  data: CalendarFeedStatusDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CalendarFeedStatusEnvelopeToJson(
  CalendarFeedStatusEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
