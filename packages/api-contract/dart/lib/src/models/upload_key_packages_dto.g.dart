// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upload_key_packages_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UploadKeyPackagesDto _$UploadKeyPackagesDtoFromJson(
  Map<String, dynamic> json,
) => UploadKeyPackagesDto(
  keyPackages: (json['keyPackages'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  lastResort: json['lastResort'] as String?,
);

Map<String, dynamic> _$UploadKeyPackagesDtoToJson(
  UploadKeyPackagesDto instance,
) => <String, dynamic>{
  'keyPackages': instance.keyPackages,
  'lastResort': ?instance.lastResort,
};
