// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_verification_request_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminVerificationRequestEnvelope _$AdminVerificationRequestEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminVerificationRequestEnvelope(
  data: AdminVerificationRequestDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminVerificationRequestEnvelopeToJson(
  AdminVerificationRequestEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
