// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'partition_card_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PartitionCardListEnvelope _$PartitionCardListEnvelopeFromJson(
  Map<String, dynamic> json,
) => PartitionCardListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => PartitionCardDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PartitionCardListEnvelopeToJson(
  PartitionCardListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
