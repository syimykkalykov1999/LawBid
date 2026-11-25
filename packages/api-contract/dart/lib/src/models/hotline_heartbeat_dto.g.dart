// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_heartbeat_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineHeartbeatDto _$HotlineHeartbeatDtoFromJson(Map<String, dynamic> json) =>
    HotlineHeartbeatDto(
      ok: json['ok'] as bool,
      seconds: json['seconds'] as num,
      waiting: json['waiting'] == null
          ? null
          : HotlineWaitingDto.fromJson(json['waiting'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$HotlineHeartbeatDtoToJson(
  HotlineHeartbeatDto instance,
) => <String, dynamic>{
  'ok': instance.ok,
  'seconds': instance.seconds,
  'waiting': ?instance.waiting?.toJson(),
};
