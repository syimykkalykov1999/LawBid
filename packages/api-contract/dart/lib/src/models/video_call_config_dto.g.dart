// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'video_call_config_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VideoCallConfigDto _$VideoCallConfigDtoFromJson(Map<String, dynamic> json) =>
    VideoCallConfigDto(
      available: json['available'] as bool,
      provider: VideoCallConfigDtoProvider.fromJson(json['provider'] as String),
      reason: json['reason'] == null
          ? null
          : VideoCallUnavailableReason.fromJson(json['reason'] as String),
    );

Map<String, dynamic> _$VideoCallConfigDtoToJson(VideoCallConfigDto instance) =>
    <String, dynamic>{
      'available': instance.available,
      'provider': instance.provider.toJson(),
      'reason': ?instance.reason?.toJson(),
    };
