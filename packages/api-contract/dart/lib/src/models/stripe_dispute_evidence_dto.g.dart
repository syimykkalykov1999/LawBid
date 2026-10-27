// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stripe_dispute_evidence_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StripeDisputeEvidenceDto _$StripeDisputeEvidenceDtoFromJson(
  Map<String, dynamic> json,
) => StripeDisputeEvidenceDto(
  fields: Map<String, String>.from(json['fields'] as Map),
  evidenceStatus: StripeDisputeEvidenceDtoEvidenceStatus.fromJson(
    json['evidenceStatus'] as String,
  ),
  dueBy: json['dueBy'] == null ? null : DateTime.parse(json['dueBy'] as String),
);

Map<String, dynamic> _$StripeDisputeEvidenceDtoToJson(
  StripeDisputeEvidenceDto instance,
) => <String, dynamic>{
  'fields': instance.fields,
  'evidenceStatus': instance.evidenceStatus.toJson(),
  'dueBy': ?instance.dueBy?.toIso8601String(),
};
