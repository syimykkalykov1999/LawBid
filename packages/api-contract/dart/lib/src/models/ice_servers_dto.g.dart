// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ice_servers_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IceServersDto _$IceServersDtoFromJson(Map<String, dynamic> json) =>
    IceServersDto(
      iceServers: (json['iceServers'] as List<dynamic>)
          .map((e) => IceServerDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      ttlSec: (json['ttlSec'] as num).toInt(),
      iceTransportPolicy: json['iceTransportPolicy'] == null
          ? null
          : IceServersDtoIceTransportPolicy.fromJson(
              json['iceTransportPolicy'] as String,
            ),
    );

Map<String, dynamic> _$IceServersDtoToJson(IceServersDto instance) =>
    <String, dynamic>{
      'iceServers': instance.iceServers.map((e) => e.toJson()).toList(),
      'ttlSec': instance.ttlSec,
      'iceTransportPolicy': ?instance.iceTransportPolicy?.toJson(),
    };
