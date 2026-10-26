// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_activity_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientActivityDto _$ClientActivityDtoFromJson(Map<String, dynamic> json) =>
    ClientActivityDto(
      online: json['online'] as bool,
      respondsWithinDay: json['respondsWithinDay'] as bool,
      lastSeenDays: (json['lastSeenDays'] as num?)?.toInt(),
    );

Map<String, dynamic> _$ClientActivityDtoToJson(ClientActivityDto instance) =>
    <String, dynamic>{
      'online': instance.online,
      'lastSeenDays': ?instance.lastSeenDays,
      'respondsWithinDay': instance.respondsWithinDay,
    };
