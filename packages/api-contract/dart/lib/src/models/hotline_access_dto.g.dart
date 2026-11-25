// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_access_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineAccessDto _$HotlineAccessDtoFromJson(Map<String, dynamic> json) =>
    HotlineAccessDto(
      mode: HotlineMode.fromJson(json['mode'] as String),
      allowed: json['allowed'] as bool,
      via: json['via'] == null
          ? null
          : HotlineAccessVia.fromJson(json['via'] as String),
      reason: json['reason'] as String?,
    );

Map<String, dynamic> _$HotlineAccessDtoToJson(HotlineAccessDto instance) =>
    <String, dynamic>{
      'mode': instance.mode.toJson(),
      'allowed': instance.allowed,
      'via': ?instance.via?.toJson(),
      'reason': ?instance.reason,
    };
