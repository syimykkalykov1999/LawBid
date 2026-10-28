// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deal_record_lookup_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DealRecordLookupEnvelope _$DealRecordLookupEnvelopeFromJson(
  Map<String, dynamic> json,
) => DealRecordLookupEnvelope(
  data: DealRecordLookupDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DealRecordLookupEnvelopeToJson(
  DealRecordLookupEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
