// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'crash_instance_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CrashInstanceDto _$CrashInstanceDtoFromJson(Map<String, dynamic> json) =>
    CrashInstanceDto(
      at: json['at'] as String,
      appVersion: json['appVersion'] as String,
      build: json['build'] as String,
      flavor: json['flavor'] as String,
      platform: json['platform'] as String,
      osVersion: json['osVersion'] as String,
      deviceModel: json['deviceModel'] as String,
      fatal: json['fatal'] as bool,
      route: json['route'] as String?,
    );

Map<String, dynamic> _$CrashInstanceDtoToJson(CrashInstanceDto instance) =>
    <String, dynamic>{
      'at': instance.at,
      'appVersion': instance.appVersion,
      'build': instance.build,
      'flavor': instance.flavor,
      'platform': instance.platform,
      'osVersion': instance.osVersion,
      'deviceModel': instance.deviceModel,
      'route': ?instance.route,
      'fatal': instance.fatal,
    };
