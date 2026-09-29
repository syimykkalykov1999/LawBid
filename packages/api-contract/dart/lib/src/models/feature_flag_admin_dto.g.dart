// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'feature_flag_admin_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FeatureFlagAdminDto _$FeatureFlagAdminDtoFromJson(Map<String, dynamic> json) =>
    FeatureFlagAdminDto(
      key: json['key'] as String,
      enabled: json['enabled'] as bool,
      rolloutPercent: (json['rolloutPercent'] as num).toInt(),
      description: json['description'] as String?,
      paid: json['paid'] as bool,
      requiredKeys: (json['requiredKeys'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      missingKeys: (json['missingKeys'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      updatedBy: json['updatedBy'] as String?,
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );

Map<String, dynamic> _$FeatureFlagAdminDtoToJson(
  FeatureFlagAdminDto instance,
) => <String, dynamic>{
  'key': instance.key,
  'enabled': instance.enabled,
  'rolloutPercent': instance.rolloutPercent,
  'description': ?instance.description,
  'paid': instance.paid,
  'requiredKeys': instance.requiredKeys,
  'missingKeys': instance.missingKeys,
  'updatedBy': ?instance.updatedBy,
  'updatedAt': instance.updatedAt.toIso8601String(),
};
