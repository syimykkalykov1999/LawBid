// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dashboard_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DashboardEnvelope _$DashboardEnvelopeFromJson(Map<String, dynamic> json) =>
    DashboardEnvelope(
      data: DashboardDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$DashboardEnvelopeToJson(DashboardEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
