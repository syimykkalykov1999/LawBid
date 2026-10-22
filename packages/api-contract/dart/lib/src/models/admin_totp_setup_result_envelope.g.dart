// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_totp_setup_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTotpSetupResultEnvelope _$AdminTotpSetupResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminTotpSetupResultEnvelope(
  data: AdminTotpSetupResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminTotpSetupResultEnvelopeToJson(
  AdminTotpSetupResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
