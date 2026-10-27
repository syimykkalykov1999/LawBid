// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_golden_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewGoldenListEnvelope _$ReviewGoldenListEnvelopeFromJson(
  Map<String, dynamic> json,
) => ReviewGoldenListEnvelope(
  data: ReviewGoldenListDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ReviewGoldenListEnvelopeToJson(
  ReviewGoldenListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
