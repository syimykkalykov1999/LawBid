// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'firm_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FirmEnvelope _$FirmEnvelopeFromJson(Map<String, dynamic> json) => FirmEnvelope(
  data: FirmDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$FirmEnvelopeToJson(FirmEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
