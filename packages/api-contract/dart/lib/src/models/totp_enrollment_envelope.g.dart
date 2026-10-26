// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'totp_enrollment_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TotpEnrollmentEnvelope _$TotpEnrollmentEnvelopeFromJson(
  Map<String, dynamic> json,
) => TotpEnrollmentEnvelope(
  data: TotpEnrollmentDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$TotpEnrollmentEnvelopeToJson(
  TotpEnrollmentEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
