// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deal_record_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DealRecordEnvelope _$DealRecordEnvelopeFromJson(Map<String, dynamic> json) =>
    DealRecordEnvelope(
      data: DealRecordDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$DealRecordEnvelopeToJson(DealRecordEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
