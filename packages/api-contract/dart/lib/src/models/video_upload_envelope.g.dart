// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'video_upload_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VideoUploadEnvelope _$VideoUploadEnvelopeFromJson(Map<String, dynamic> json) =>
    VideoUploadEnvelope(
      data: VideoUploadDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$VideoUploadEnvelopeToJson(
  VideoUploadEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
