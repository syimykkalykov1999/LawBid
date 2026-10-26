// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'crash_report_in_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CrashReportInDto _$CrashReportInDtoFromJson(Map<String, dynamic> json) =>
    CrashReportInDto(
      message: json['message'] as String,
      stack: json['stack'] as String,
      platform: json['platform'] as String,
      appVersion: json['appVersion'] as String,
      build: json['build'] as String,
      flavor: json['flavor'] as String,
      osVersion: json['osVersion'] as String,
      deviceModel: json['deviceModel'] as String,
      fatal: json['fatal'] as bool?,
      route: json['route'] as String?,
    );

Map<String, dynamic> _$CrashReportInDtoToJson(CrashReportInDto instance) =>
    <String, dynamic>{
      'message': instance.message,
      'stack': instance.stack,
      'fatal': ?instance.fatal,
      'platform': instance.platform,
      'appVersion': instance.appVersion,
      'build': instance.build,
      'flavor': instance.flavor,
      'osVersion': instance.osVersion,
      'deviceModel': instance.deviceModel,
      'route': ?instance.route,
    };
