// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'phone_status_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PhoneStatusResultEnvelope _$PhoneStatusResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => PhoneStatusResultEnvelope(
  data: PhoneStatusResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PhoneStatusResultEnvelopeToJson(
  PhoneStatusResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
