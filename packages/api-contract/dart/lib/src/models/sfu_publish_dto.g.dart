// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_publish_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuPublishDto _$SfuPublishDtoFromJson(Map<String, dynamic> json) =>
    SfuPublishDto(
      sdp: json['sdp'] as String,
      tracks: (json['tracks'] as List<dynamic>)
          .map((e) => SfuPublishTrackDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$SfuPublishDtoToJson(SfuPublishDto instance) =>
    <String, dynamic>{
      'sdp': instance.sdp,
      'tracks': instance.tracks.map((e) => e.toJson()).toList(),
    };
