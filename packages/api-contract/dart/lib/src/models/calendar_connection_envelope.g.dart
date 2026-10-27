// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'calendar_connection_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CalendarConnectionEnvelope _$CalendarConnectionEnvelopeFromJson(
  Map<String, dynamic> json,
) => CalendarConnectionEnvelope(
  data: CalendarConnectionDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CalendarConnectionEnvelopeToJson(
  CalendarConnectionEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
