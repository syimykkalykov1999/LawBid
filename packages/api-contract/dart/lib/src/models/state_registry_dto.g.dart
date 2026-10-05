// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'state_registry_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StateRegistryDto _$StateRegistryDtoFromJson(Map<String, dynamic> json) =>
    StateRegistryDto(
      stateCode: json['stateCode'] as String,
      stateName: json['stateName'] as String,
      adapter: StateRegistryDtoAdapter.fromJson(json['adapter'] as String),
      enabled: json['enabled'] as bool,
      config: Map<String, String>.from(json['config'] as Map),
      hasSecret: json['hasSecret'] as bool,
      secretMasked: json['secretMasked'] as String?,
      testBarNumber: json['testBarNumber'] as String?,
      lastTestAt: json['lastTestAt'] == null
          ? null
          : DateTime.parse(json['lastTestAt'] as String),
      lastTestResult: json['lastTestResult'],
      updatedAt: json['updatedAt'] == null
          ? null
          : DateTime.parse(json['updatedAt'] as String),
    );

Map<String, dynamic> _$StateRegistryDtoToJson(StateRegistryDto instance) =>
    <String, dynamic>{
      'stateCode': instance.stateCode,
      'stateName': instance.stateName,
      'adapter': instance.adapter.toJson(),
      'enabled': instance.enabled,
      'config': instance.config,
      'hasSecret': instance.hasSecret,
      'secretMasked': ?instance.secretMasked,
      'testBarNumber': ?instance.testBarNumber,
      'lastTestAt': ?instance.lastTestAt?.toIso8601String(),
      'lastTestResult': ?instance.lastTestResult,
      'updatedAt': ?instance.updatedAt?.toIso8601String(),
    };
