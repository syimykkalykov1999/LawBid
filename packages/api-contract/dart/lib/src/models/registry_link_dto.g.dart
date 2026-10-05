// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'registry_link_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegistryLinkDto _$RegistryLinkDtoFromJson(Map<String, dynamic> json) =>
    RegistryLinkDto(
      stateCode: json['stateCode'] as String,
      stateName: json['stateName'] as String,
      url: json['url'] as String?,
    );

Map<String, dynamic> _$RegistryLinkDtoToJson(RegistryLinkDto instance) =>
    <String, dynamic>{
      'stateCode': instance.stateCode,
      'stateName': instance.stateName,
      'url': ?instance.url,
    };
