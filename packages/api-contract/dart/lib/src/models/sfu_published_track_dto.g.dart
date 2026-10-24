// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_published_track_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuPublishedTrackDto _$SfuPublishedTrackDtoFromJson(
  Map<String, dynamic> json,
) => SfuPublishedTrackDto(
  mid: json['mid'] as String,
  trackName: SfuPublishedTrackDtoTrackName.fromJson(
    json['trackName'] as String,
  ),
);

Map<String, dynamic> _$SfuPublishedTrackDtoToJson(
  SfuPublishedTrackDto instance,
) => <String, dynamic>{
  'mid': instance.mid,
  'trackName': instance.trackName.toJson(),
};
