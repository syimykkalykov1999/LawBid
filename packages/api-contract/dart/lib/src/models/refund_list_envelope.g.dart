// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'refund_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RefundListEnvelope _$RefundListEnvelopeFromJson(Map<String, dynamic> json) =>
    RefundListEnvelope(
      data: (json['data'] as List<dynamic>)
          .map((e) => RefundDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$RefundListEnvelopeToJson(RefundListEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.map((e) => e.toJson()).toList(),
      'meta': ?instance.meta?.toJson(),
    };
