// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_review_appeal_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminReviewAppealListEnvelope _$AdminReviewAppealListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminReviewAppealListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminReviewAppealDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminReviewAppealListEnvelopeToJson(
  AdminReviewAppealListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
