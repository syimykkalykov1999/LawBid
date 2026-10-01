// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_review_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminReviewRowListEnvelope _$AdminReviewRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminReviewRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminReviewRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminReviewRowListEnvelopeToJson(
  AdminReviewRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
