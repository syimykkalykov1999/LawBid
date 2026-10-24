// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_publish_track_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuPublishTrackDto _$SfuPublishTrackDtoFromJson(Map<String, dynamic> json) =>
    SfuPublishTrackDto(
      mid: json['mid'] as String,
      trackName: SfuPublishTrackDtoTrackName.fromJson(
        json['trackName'] as String,
      ),
    );

Map<String, dynamic> _$SfuPublishTrackDtoToJson(SfuPublishTrackDto instance) =>
    <String, dynamic>{
      'mid': instance.mid,
      'trackName': instance.trackName.toJson(),
    };
