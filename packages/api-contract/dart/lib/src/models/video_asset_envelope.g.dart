// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'video_asset_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VideoAssetEnvelope _$VideoAssetEnvelopeFromJson(Map<String, dynamic> json) =>
    VideoAssetEnvelope(
      data: VideoAssetDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$VideoAssetEnvelopeToJson(VideoAssetEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
