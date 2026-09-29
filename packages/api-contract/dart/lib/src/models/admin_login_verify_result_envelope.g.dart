// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_login_verify_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminLoginVerifyResultEnvelope _$AdminLoginVerifyResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminLoginVerifyResultEnvelope(
  data: AdminLoginVerifyResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminLoginVerifyResultEnvelopeToJson(
  AdminLoginVerifyResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
