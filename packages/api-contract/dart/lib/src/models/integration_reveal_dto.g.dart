// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'integration_reveal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IntegrationRevealDto _$IntegrationRevealDtoFromJson(
  Map<String, dynamic> json,
) => IntegrationRevealDto(
  version: json['version'] as num,
  values: Map<String, String>.from(json['values'] as Map),
);

Map<String, dynamic> _$IntegrationRevealDtoToJson(
  IntegrationRevealDto instance,
) => <String, dynamic>{'version': instance.version, 'values': instance.values};
