// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_two_factor_enabled_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTwoFactorEnabledEnvelope _$AdminTwoFactorEnabledEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminTwoFactorEnabledEnvelope(
  data: AdminTwoFactorEnabledDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminTwoFactorEnabledEnvelopeToJson(
  AdminTwoFactorEnabledEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
