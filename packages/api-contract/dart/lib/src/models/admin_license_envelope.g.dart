// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_license_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminLicenseEnvelope _$AdminLicenseEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminLicenseEnvelope(
  data: AdminLicenseDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminLicenseEnvelopeToJson(
  AdminLicenseEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
