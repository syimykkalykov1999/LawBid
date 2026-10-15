// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'crash_group_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CrashGroupDto _$CrashGroupDtoFromJson(Map<String, dynamic> json) =>
    CrashGroupDto(
      fingerprint: json['fingerprint'] as String,
      message: json['message'] as String,
      count: json['count'] as num,
      devices: json['devices'] as num,
      fatal: json['fatal'] as num,
      versions: (json['versions'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      firstAt: json['firstAt'] as String,
      lastAt: json['lastAt'] as String,
    );

Map<String, dynamic> _$CrashGroupDtoToJson(CrashGroupDto instance) =>
    <String, dynamic>{
      'fingerprint': instance.fingerprint,
      'message': instance.message,
      'count': instance.count,
      'devices': instance.devices,
      'fatal': instance.fatal,
      'versions': instance.versions,
      'firstAt': instance.firstAt,
      'lastAt': instance.lastAt,
    };
