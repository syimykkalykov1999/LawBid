// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'missed_events_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MissedEventsEnvelope _$MissedEventsEnvelopeFromJson(
  Map<String, dynamic> json,
) => MissedEventsEnvelope(
  data: MissedEventsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MissedEventsEnvelopeToJson(
  MissedEventsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
