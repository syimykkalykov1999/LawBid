// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_publish_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuPublishResultDto _$SfuPublishResultDtoFromJson(Map<String, dynamic> json) =>
    SfuPublishResultDto(
      type: SfuPublishResultDtoType.fromJson(json['type'] as String),
      sdp: json['sdp'] as String,
      tracks: (json['tracks'] as List<dynamic>)
          .map((e) => SfuPublishedTrackDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      failed: (json['failed'] as List<dynamic>)
          .map((e) => SfuPublishFailedDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$SfuPublishResultDtoToJson(
  SfuPublishResultDto instance,
) => <String, dynamic>{
  'type': instance.type.toJson(),
  'sdp': instance.sdp,
  'tracks': instance.tracks.map((e) => e.toJson()).toList(),
  'failed': instance.failed.map((e) => e.toJson()).toList(),
};
