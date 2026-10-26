// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'refund_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RefundEnvelope _$RefundEnvelopeFromJson(Map<String, dynamic> json) =>
    RefundEnvelope(
      data: RefundDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$RefundEnvelopeToJson(RefundEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
