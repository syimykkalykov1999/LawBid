// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_hour_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineHourDto _$HotlineHourDtoFromJson(Map<String, dynamic> json) =>
    HotlineHourDto(
      hour: json['hour'] as String,
      requests: json['requests'] as num,
      offers: json['offers'] as num,
      accepted: json['accepted'] as num,
      declined: json['declined'] as num,
      timeouts: json['timeouts'] as num,
      ended: json['ended'] as num,
      talkSeconds: json['talkSeconds'] as num,
      notices: json['notices'] as num,
      peakOnline: json['peakOnline'] as num,
    );

Map<String, dynamic> _$HotlineHourDtoToJson(HotlineHourDto instance) =>
    <String, dynamic>{
      'hour': instance.hour,
      'requests': instance.requests,
      'offers': instance.offers,
      'accepted': instance.accepted,
      'declined': instance.declined,
      'timeouts': instance.timeouts,
      'ended': instance.ended,
      'talkSeconds': instance.talkSeconds,
      'notices': instance.notices,
      'peakOnline': instance.peakOnline,
    };
