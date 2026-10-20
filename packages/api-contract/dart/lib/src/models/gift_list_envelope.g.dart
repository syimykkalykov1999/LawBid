// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'gift_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GiftListEnvelope _$GiftListEnvelopeFromJson(Map<String, dynamic> json) =>
    GiftListEnvelope(
      data: (json['data'] as List<dynamic>)
          .map((e) => GiftDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$GiftListEnvelopeToJson(GiftListEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.map((e) => e.toJson()).toList(),
      'meta': ?instance.meta?.toJson(),
    };
