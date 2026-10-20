// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'consultation_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConsultationListEnvelope _$ConsultationListEnvelopeFromJson(
  Map<String, dynamic> json,
) => ConsultationListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => ConsultationDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ConsultationListEnvelopeToJson(
  ConsultationListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
