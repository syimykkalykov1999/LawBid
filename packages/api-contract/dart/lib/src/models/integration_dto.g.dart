// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'integration_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IntegrationDto _$IntegrationDtoFromJson(
  Map<String, dynamic> json,
) => IntegrationDto(
  provider: json['provider'] as String,
  label: json['label'] as String,
  description: json['description'] as String,
  restartRequired: json['restartRequired'] as bool,
  testable: json['testable'] as bool,
  fields: (json['fields'] as List<dynamic>)
      .map((e) => IntegrationFieldDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  source: IntegrationDtoSource.fromJson(json['source'] as String),
  configured: json['configured'] as bool,
  warning: json['warning'] as String?,
  active: json['active'] == null
      ? null
      : IntegrationVersionDto.fromJson(json['active'] as Map<String, dynamic>),
  pending: json['pending'] == null
      ? null
      : IntegrationVersionDto.fromJson(json['pending'] as Map<String, dynamic>),
  envMasked: (json['envMasked'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, e as String),
  ),
);

Map<String, dynamic> _$IntegrationDtoToJson(IntegrationDto instance) =>
    <String, dynamic>{
      'provider': instance.provider,
      'label': instance.label,
      'description': instance.description,
      'restartRequired': instance.restartRequired,
      'warning': ?instance.warning,
      'testable': instance.testable,
      'fields': instance.fields.map((e) => e.toJson()).toList(),
      'source': instance.source.toJson(),
      'configured': instance.configured,
      'active': ?instance.active?.toJson(),
      'pending': ?instance.pending?.toJson(),
      'envMasked': ?instance.envMasked,
    };
