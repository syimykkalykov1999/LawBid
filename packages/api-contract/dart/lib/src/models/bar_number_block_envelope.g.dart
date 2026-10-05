// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bar_number_block_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BarNumberBlockEnvelope _$BarNumberBlockEnvelopeFromJson(
  Map<String, dynamic> json,
) => BarNumberBlockEnvelope(
  data: BarNumberBlockDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$BarNumberBlockEnvelopeToJson(
  BarNumberBlockEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
