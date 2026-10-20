// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'consultation_slots_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConsultationSlotsEnvelope _$ConsultationSlotsEnvelopeFromJson(
  Map<String, dynamic> json,
) => ConsultationSlotsEnvelope(
  data: ConsultationSlotsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ConsultationSlotsEnvelopeToJson(
  ConsultationSlotsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
