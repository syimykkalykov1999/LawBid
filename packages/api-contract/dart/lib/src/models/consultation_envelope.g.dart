// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'consultation_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConsultationEnvelope _$ConsultationEnvelopeFromJson(
  Map<String, dynamic> json,
) => ConsultationEnvelope(
  data: ConsultationDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ConsultationEnvelopeToJson(
  ConsultationEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
