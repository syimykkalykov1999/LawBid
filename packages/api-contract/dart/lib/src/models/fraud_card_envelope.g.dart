// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fraud_card_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FraudCardEnvelope _$FraudCardEnvelopeFromJson(Map<String, dynamic> json) =>
    FraudCardEnvelope(
      data: FraudCardDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$FraudCardEnvelopeToJson(FraudCardEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
