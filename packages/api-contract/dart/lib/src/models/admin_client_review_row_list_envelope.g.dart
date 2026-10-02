// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_client_review_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminClientReviewRowListEnvelope _$AdminClientReviewRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminClientReviewRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminClientReviewRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminClientReviewRowListEnvelopeToJson(
  AdminClientReviewRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
