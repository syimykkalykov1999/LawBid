// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'call_media_fallback_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CallMediaFallbackDto _$CallMediaFallbackDtoFromJson(
  Map<String, dynamic> json,
) => CallMediaFallbackDto(
  active: json['active'] as bool,
  reason: json['reason'] == null
      ? null
      : CallMediaFallbackDtoReason.fromJson(json['reason'] as String),
  videoBlocked: json['videoBlocked'] as bool,
  videoMaxParticipants: json['videoMaxParticipants'] as num,
);

Map<String, dynamic> _$CallMediaFallbackDtoToJson(
  CallMediaFallbackDto instance,
) => <String, dynamic>{
  'active': instance.active,
  'reason': ?instance.reason?.toJson(),
  'videoBlocked': instance.videoBlocked,
  'videoMaxParticipants': instance.videoMaxParticipants,
};
