// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ice_servers_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IceServersEnvelope _$IceServersEnvelopeFromJson(Map<String, dynamic> json) =>
    IceServersEnvelope(
      data: IceServersDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$IceServersEnvelopeToJson(IceServersEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
