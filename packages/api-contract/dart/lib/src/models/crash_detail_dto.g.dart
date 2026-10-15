// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'crash_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CrashDetailDto _$CrashDetailDtoFromJson(Map<String, dynamic> json) =>
    CrashDetailDto(
      fingerprint: json['fingerprint'] as String,
      message: json['message'] as String,
      stack: json['stack'] as String,
      versions: (json['versions'] as List<dynamic>)
          .map((e) => CrashCountDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      systems: (json['systems'] as List<dynamic>)
          .map((e) => CrashCountDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      devices: (json['devices'] as List<dynamic>)
          .map((e) => CrashCountDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      latest: (json['latest'] as List<dynamic>)
          .map((e) => CrashInstanceDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$CrashDetailDtoToJson(CrashDetailDto instance) =>
    <String, dynamic>{
      'fingerprint': instance.fingerprint,
      'message': instance.message,
      'stack': instance.stack,
      'versions': instance.versions.map((e) => e.toJson()).toList(),
      'systems': instance.systems.map((e) => e.toJson()).toList(),
      'devices': instance.devices.map((e) => e.toJson()).toList(),
      'latest': instance.latest.map((e) => e.toJson()).toList(),
    };
