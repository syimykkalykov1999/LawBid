// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'calendar_connect_start_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CalendarConnectStartEnvelope _$CalendarConnectStartEnvelopeFromJson(
  Map<String, dynamic> json,
) => CalendarConnectStartEnvelope(
  data: CalendarConnectStartDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CalendarConnectStartEnvelopeToJson(
  CalendarConnectStartEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
