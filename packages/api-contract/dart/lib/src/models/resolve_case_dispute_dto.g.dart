// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'resolve_case_dispute_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ResolveCaseDisputeDto _$ResolveCaseDisputeDtoFromJson(
  Map<String, dynamic> json,
) => ResolveCaseDisputeDto(
  decision: ResolveCaseDisputeDtoDecision.fromJson(json['decision'] as String),
  note: json['note'] as String,
);

Map<String, dynamic> _$ResolveCaseDisputeDtoToJson(
  ResolveCaseDisputeDto instance,
) => <String, dynamic>{
  'decision': instance.decision.toJson(),
  'note': instance.note,
};
