// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'lease_ok_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LeaseOkEnvelope _$LeaseOkEnvelopeFromJson(Map<String, dynamic> json) =>
    LeaseOkEnvelope(
      data: LeaseOkDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$LeaseOkEnvelopeToJson(LeaseOkEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
