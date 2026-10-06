// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dmca_mine_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DmcaMineEnvelope _$DmcaMineEnvelopeFromJson(Map<String, dynamic> json) =>
    DmcaMineEnvelope(
      data: DmcaMineDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$DmcaMineEnvelopeToJson(DmcaMineEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
