// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'resolve_contact_issue_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ResolveContactIssueDto _$ResolveContactIssueDtoFromJson(
  Map<String, dynamic> json,
) => ResolveContactIssueDto(
  decision: ResolveContactIssueDtoDecision.fromJson(json['decision'] as String),
  note: json['note'] as String,
);

Map<String, dynamic> _$ResolveContactIssueDtoToJson(
  ResolveContactIssueDto instance,
) => <String, dynamic>{
  'decision': instance.decision.toJson(),
  'note': instance.note,
};
