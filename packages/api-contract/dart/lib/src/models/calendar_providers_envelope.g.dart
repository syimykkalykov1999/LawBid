// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'calendar_providers_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CalendarProvidersEnvelope _$CalendarProvidersEnvelopeFromJson(
  Map<String, dynamic> json,
) => CalendarProvidersEnvelope(
  data: CalendarProvidersDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CalendarProvidersEnvelopeToJson(
  CalendarProvidersEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
