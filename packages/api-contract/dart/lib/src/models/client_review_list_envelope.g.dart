// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_review_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientReviewListEnvelope _$ClientReviewListEnvelopeFromJson(
  Map<String, dynamic> json,
) => ClientReviewListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => ClientReviewDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ClientReviewListEnvelopeToJson(
  ClientReviewListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
