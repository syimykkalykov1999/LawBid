// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_subscribe_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuSubscribeDto _$SfuSubscribeDtoFromJson(Map<String, dynamic> json) =>
    SfuSubscribeDto(
      userIds: (json['userIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      trackNames: (json['trackNames'] as List<dynamic>?)
          ?.map((e) => SfuSubscribeDtoTrackNames.fromJson(e as String))
          .toList(),
      rid: json['rid'] == null
          ? null
          : SfuSubscribeDtoRid.fromJson(json['rid'] as String),
    );

Map<String, dynamic> _$SfuSubscribeDtoToJson(SfuSubscribeDto instance) =>
    <String, dynamic>{
      'userIds': ?instance.userIds,
      'trackNames': ?instance.trackNames?.map((e) => e.toJson()).toList(),
      'rid': ?instance.rid?.toJson(),
    };
