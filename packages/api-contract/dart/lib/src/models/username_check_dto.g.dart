// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'username_check_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UsernameCheckDto _$UsernameCheckDtoFromJson(Map<String, dynamic> json) =>
    UsernameCheckDto(
      username: json['username'] as String,
      available: json['available'] as bool,
      reason: json['reason'] == null
          ? null
          : UsernameCheckReason.fromJson(json['reason'] as String),
      suggestions: (json['suggestions'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$UsernameCheckDtoToJson(UsernameCheckDto instance) =>
    <String, dynamic>{
      'username': instance.username,
      'available': instance.available,
      'reason': ?instance.reason?.toJson(),
      'suggestions': instance.suggestions,
    };
