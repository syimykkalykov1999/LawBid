// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'video_call_config_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VideoCallConfigEnvelope _$VideoCallConfigEnvelopeFromJson(
  Map<String, dynamic> json,
) => VideoCallConfigEnvelope(
  data: VideoCallConfigDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$VideoCallConfigEnvelopeToJson(
  VideoCallConfigEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
