// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fraud_event_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FraudEventListEnvelope _$FraudEventListEnvelopeFromJson(
  Map<String, dynamic> json,
) => FraudEventListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => FraudEventDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$FraudEventListEnvelopeToJson(
  FraudEventListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
