// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cost_registry_unclaimed_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CostRegistryUnclaimedDto _$CostRegistryUnclaimedDtoFromJson(
  Map<String, dynamic> json,
) => CostRegistryUnclaimedDto(
  service: json['service'] as String,
  usd: json['usd'] as num,
);

Map<String, dynamic> _$CostRegistryUnclaimedDtoToJson(
  CostRegistryUnclaimedDto instance,
) => <String, dynamic>{'service': instance.service, 'usd': instance.usd};
