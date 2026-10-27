// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_ai_hint_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffAiHintEnvelope _$StaffAiHintEnvelopeFromJson(Map<String, dynamic> json) =>
    StaffAiHintEnvelope(
      data: StaffAiHintDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$StaffAiHintEnvelopeToJson(
  StaffAiHintEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
