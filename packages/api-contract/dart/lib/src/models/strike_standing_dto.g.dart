// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'strike_standing_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StrikeStandingDto _$StrikeStandingDtoFromJson(Map<String, dynamic> json) =>
    StrikeStandingDto(
      enabled: json['enabled'] as bool,
      points: (json['points'] as num).toInt(),
      limit: StrikeLimitDto.fromJson(json['limit'] as Map<String, dynamic>),
      strikes: (json['strikes'] as List<dynamic>)
          .map((e) => StrikeDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$StrikeStandingDtoToJson(StrikeStandingDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'points': instance.points,
      'limit': instance.limit.toJson(),
      'strikes': instance.strikes.map((e) => e.toJson()).toList(),
    };
