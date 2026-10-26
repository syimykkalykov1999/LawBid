// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bar_number_block_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BarNumberBlockListEnvelope _$BarNumberBlockListEnvelopeFromJson(
  Map<String, dynamic> json,
) => BarNumberBlockListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => BarNumberBlockDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$BarNumberBlockListEnvelopeToJson(
  BarNumberBlockListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
