// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_live_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineLiveDto _$HotlineLiveDtoFromJson(Map<String, dynamic> json) =>
    HotlineLiveDto(
      enabled: json['enabled'] as bool,
      onLine: json['onLine'] as num,
      idle: json['idle'] as num,
      offered: json['offered'] as num,
      inCall: json['inCall'] as num,
      notAccepting: json['notAccepting'] as num,
      paused: json['paused'] as num,
      waitingOnline: json['waitingOnline'] as num,
      waitingOffline: json['waitingOffline'] as num,
      callsNow: json['callsNow'] as num,
      buckets: (json['buckets'] as List<dynamic>)
          .map((e) => HotlineBucketRowDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      hours: (json['hours'] as List<dynamic>)
          .map((e) => HotlineHourDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$HotlineLiveDtoToJson(HotlineLiveDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'onLine': instance.onLine,
      'idle': instance.idle,
      'offered': instance.offered,
      'inCall': instance.inCall,
      'notAccepting': instance.notAccepting,
      'paused': instance.paused,
      'waitingOnline': instance.waitingOnline,
      'waitingOffline': instance.waitingOffline,
      'callsNow': instance.callsNow,
      'buckets': instance.buckets.map((e) => e.toJson()).toList(),
      'hours': instance.hours.map((e) => e.toJson()).toList(),
    };
