// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'claim_key_packages_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClaimKeyPackagesDto _$ClaimKeyPackagesDtoFromJson(Map<String, dynamic> json) =>
    ClaimKeyPackagesDto(
      deviceIds: (json['deviceIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$ClaimKeyPackagesDtoToJson(
  ClaimKeyPackagesDto instance,
) => <String, dynamic>{'deviceIds': instance.deviceIds};
