// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'claimed_key_package_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClaimedKeyPackageDto _$ClaimedKeyPackageDtoFromJson(
  Map<String, dynamic> json,
) => ClaimedKeyPackageDto(
  deviceId: json['deviceId'] as String,
  userId: json['userId'] as String,
  keyPackage: json['keyPackage'] as String?,
);

Map<String, dynamic> _$ClaimedKeyPackageDtoToJson(
  ClaimedKeyPackageDto instance,
) => <String, dynamic>{
  'deviceId': instance.deviceId,
  'userId': instance.userId,
  'keyPackage': ?instance.keyPackage,
};
