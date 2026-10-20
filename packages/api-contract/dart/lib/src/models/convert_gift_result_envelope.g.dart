// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'convert_gift_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConvertGiftResultEnvelope _$ConvertGiftResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => ConvertGiftResultEnvelope(
  data: ConvertGiftResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ConvertGiftResultEnvelopeToJson(
  ConvertGiftResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
