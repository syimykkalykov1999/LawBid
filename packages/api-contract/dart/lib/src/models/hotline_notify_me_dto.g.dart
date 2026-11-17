// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_notify_me_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineNotifyMeDto _$HotlineNotifyMeDtoFromJson(Map<String, dynamic> json) =>
    HotlineNotifyMeDto(
      allowNight: json['allowNight'] as bool? ?? false,
      timeZone: json['timeZone'] as String?,
    );

Map<String, dynamic> _$HotlineNotifyMeDtoToJson(HotlineNotifyMeDto instance) =>
    <String, dynamic>{
      'timeZone': ?instance.timeZone,
      'allowNight': instance.allowNight,
    };
