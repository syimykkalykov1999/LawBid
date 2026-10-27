// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'lease_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LeaseEnvelope _$LeaseEnvelopeFromJson(Map<String, dynamic> json) =>
    LeaseEnvelope(
      data: LeaseDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$LeaseEnvelopeToJson(LeaseEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
