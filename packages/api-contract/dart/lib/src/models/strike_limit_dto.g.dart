// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'strike_limit_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StrikeLimitDto _$StrikeLimitDtoFromJson(Map<String, dynamic> json) =>
    StrikeLimitDto(
      level: StrikeLimitDtoLevel.fromJson(json['level'] as String),
      until: json['until'] == null
          ? null
          : DateTime.parse(json['until'] as String),
    );

Map<String, dynamic> _$StrikeLimitDtoToJson(StrikeLimitDto instance) =>
    <String, dynamic>{
      'level': instance.level.toJson(),
      'until': ?instance.until?.toIso8601String(),
    };
