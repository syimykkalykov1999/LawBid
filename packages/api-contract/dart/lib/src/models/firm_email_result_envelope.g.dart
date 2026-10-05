// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'firm_email_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FirmEmailResultEnvelope _$FirmEmailResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => FirmEmailResultEnvelope(
  data: FirmEmailResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$FirmEmailResultEnvelopeToJson(
  FirmEmailResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
