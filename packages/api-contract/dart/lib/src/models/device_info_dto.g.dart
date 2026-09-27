// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'device_info_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeviceInfoDto _$DeviceInfoDtoFromJson(Map<String, dynamic> json) =>
    DeviceInfoDto(
      deviceId: json['deviceId'] as String?,
      deviceName: json['deviceName'] as String?,
      platform: json['platform'] as String?,
      appVersion: json['appVersion'] as String?,
    );

Map<String, dynamic> _$DeviceInfoDtoToJson(DeviceInfoDto instance) =>
    <String, dynamic>{
      'deviceId': ?instance.deviceId,
      'deviceName': ?instance.deviceName,
      'platform': ?instance.platform,
      'appVersion': ?instance.appVersion,
    };
