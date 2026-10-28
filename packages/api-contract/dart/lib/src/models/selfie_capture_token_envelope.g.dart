// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'selfie_capture_token_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SelfieCaptureTokenEnvelope _$SelfieCaptureTokenEnvelopeFromJson(
  Map<String, dynamic> json,
) => SelfieCaptureTokenEnvelope(
  data: SelfieCaptureTokenDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SelfieCaptureTokenEnvelopeToJson(
  SelfieCaptureTokenEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
