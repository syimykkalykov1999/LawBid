// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_session_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuSessionDto _$SfuSessionDtoFromJson(Map<String, dynamic> json) =>
    SfuSessionDto(
      sessionId: json['sessionId'] as String,
      iceServers: (json['iceServers'] as List<dynamic>)
          .map((e) => SfuIceServerDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$SfuSessionDtoToJson(SfuSessionDto instance) =>
    <String, dynamic>{
      'sessionId': instance.sessionId,
      'iceServers': instance.iceServers.map((e) => e.toJson()).toList(),
    };
