// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_watermark_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffWatermarkEnvelope _$StaffWatermarkEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffWatermarkEnvelope(
  data: StaffWatermarkDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffWatermarkEnvelopeToJson(
  StaffWatermarkEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
