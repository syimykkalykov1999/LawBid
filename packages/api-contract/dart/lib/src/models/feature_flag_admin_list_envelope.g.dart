// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'feature_flag_admin_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FeatureFlagAdminListEnvelope _$FeatureFlagAdminListEnvelopeFromJson(
  Map<String, dynamic> json,
) => FeatureFlagAdminListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => FeatureFlagAdminDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$FeatureFlagAdminListEnvelopeToJson(
  FeatureFlagAdminListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
