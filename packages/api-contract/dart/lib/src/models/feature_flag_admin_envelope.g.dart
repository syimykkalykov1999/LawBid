// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'feature_flag_admin_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FeatureFlagAdminEnvelope _$FeatureFlagAdminEnvelopeFromJson(
  Map<String, dynamic> json,
) => FeatureFlagAdminEnvelope(
  data: FeatureFlagAdminDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$FeatureFlagAdminEnvelopeToJson(
  FeatureFlagAdminEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
