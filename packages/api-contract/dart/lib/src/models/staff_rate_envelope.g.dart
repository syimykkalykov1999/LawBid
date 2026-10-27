// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_rate_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffRateEnvelope _$StaffRateEnvelopeFromJson(Map<String, dynamic> json) =>
    StaffRateEnvelope(
      data: StaffRateDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$StaffRateEnvelopeToJson(StaffRateEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
