// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'license_recheck_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LicenseRecheckEnvelope _$LicenseRecheckEnvelopeFromJson(
  Map<String, dynamic> json,
) => LicenseRecheckEnvelope(
  data: LicenseRecheckDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$LicenseRecheckEnvelopeToJson(
  LicenseRecheckEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
