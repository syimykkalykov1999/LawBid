// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'live_kit_join_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LiveKitJoinDto _$LiveKitJoinDtoFromJson(Map<String, dynamic> json) =>
    LiveKitJoinDto(
      url: json['url'] as String,
      token: json['token'] as String,
      room: json['room'] as String,
      identity: json['identity'] as String,
      role: LiveKitJoinDtoRole.fromJson(json['role'] as String),
      expiresAt: DateTime.parse(json['expiresAt'] as String),
    );

Map<String, dynamic> _$LiveKitJoinDtoToJson(LiveKitJoinDto instance) =>
    <String, dynamic>{
      'url': instance.url,
      'token': instance.token,
      'room': instance.room,
      'identity': instance.identity,
      'role': instance.role.toJson(),
      'expiresAt': instance.expiresAt.toIso8601String(),
    };
