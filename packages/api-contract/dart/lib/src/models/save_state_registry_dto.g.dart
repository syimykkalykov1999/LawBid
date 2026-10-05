// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'save_state_registry_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SaveStateRegistryDto _$SaveStateRegistryDtoFromJson(
  Map<String, dynamic> json,
) => SaveStateRegistryDto(
  adapter: SaveStateRegistryDtoAdapter.fromJson(json['adapter'] as String),
  enabled: json['enabled'] as bool,
  config: (json['config'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, e as String),
  ),
  secret: json['secret'] as String?,
  clearSecret: json['clearSecret'] as bool?,
  testBarNumber: json['testBarNumber'] as String?,
);

Map<String, dynamic> _$SaveStateRegistryDtoToJson(
  SaveStateRegistryDto instance,
) => <String, dynamic>{
  'adapter': instance.adapter.toJson(),
  'enabled': instance.enabled,
  'config': ?instance.config,
  'secret': ?instance.secret,
  'clearSecret': ?instance.clearSecret,
  'testBarNumber': ?instance.testBarNumber,
};
