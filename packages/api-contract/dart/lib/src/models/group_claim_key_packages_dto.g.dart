// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_claim_key_packages_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupClaimKeyPackagesDto _$GroupClaimKeyPackagesDtoFromJson(
  Map<String, dynamic> json,
) => GroupClaimKeyPackagesDto(
  deviceId: json['deviceId'] as String,
  deviceIds: (json['deviceIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$GroupClaimKeyPackagesDtoToJson(
  GroupClaimKeyPackagesDto instance,
) => <String, dynamic>{
  'deviceId': instance.deviceId,
  'deviceIds': instance.deviceIds,
};
