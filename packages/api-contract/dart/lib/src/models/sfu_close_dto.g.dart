// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_close_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuCloseDto _$SfuCloseDtoFromJson(Map<String, dynamic> json) => SfuCloseDto(
  trackNames: (json['trackNames'] as List<dynamic>?)
      ?.map((e) => SfuCloseDtoTrackNames.fromJson(e as String))
      .toList(),
  userIds: (json['userIds'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  sdp: json['sdp'] as String?,
);

Map<String, dynamic> _$SfuCloseDtoToJson(SfuCloseDto instance) =>
    <String, dynamic>{
      'trackNames': ?instance.trackNames?.map((e) => e.toJson()).toList(),
      'userIds': ?instance.userIds,
      'sdp': ?instance.sdp,
    };
