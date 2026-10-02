// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'video_asset_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VideoAssetDto _$VideoAssetDtoFromJson(Map<String, dynamic> json) =>
    VideoAssetDto(
      id: json['id'] as String,
      status: VideoAssetStatus.fromJson(json['status'] as String),
      durationSec: (json['durationSec'] as num?)?.toInt(),
      failureReason: json['failureReason'] as String?,
    );

Map<String, dynamic> _$VideoAssetDtoToJson(VideoAssetDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'status': instance.status.toJson(),
      'durationSec': ?instance.durationSec,
      'failureReason': ?instance.failureReason,
    };
