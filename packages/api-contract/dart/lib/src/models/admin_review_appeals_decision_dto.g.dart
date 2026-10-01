// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_review_appeals_decision_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminReviewAppealsDecisionDto _$AdminReviewAppealsDecisionDtoFromJson(
  Map<String, dynamic> json,
) => AdminReviewAppealsDecisionDto(
  ids: (json['ids'] as List<dynamic>).map((e) => e as String).toList(),
  decision: AdminReviewAppealsDecisionDtoDecision.fromJson(
    json['decision'] as String,
  ),
  note: json['note'] as String?,
);

Map<String, dynamic> _$AdminReviewAppealsDecisionDtoToJson(
  AdminReviewAppealsDecisionDto instance,
) => <String, dynamic>{
  'ids': instance.ids,
  'decision': instance.decision.toJson(),
  'note': ?instance.note,
};
