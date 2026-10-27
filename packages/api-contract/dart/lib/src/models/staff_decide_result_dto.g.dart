// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_decide_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffDecideResultDto _$StaffDecideResultDtoFromJson(
  Map<String, dynamic> json,
) => StaffDecideResultDto(
  id: json['id'] as String,
  status: StaffDecideResultDtoStatus.fromJson(json['status'] as String),
  decision: StaffDecideResultDtoDecision.fromJson(json['decision'] as String),
  decidedAt: DateTime.parse(json['decidedAt'] as String),
  followUp: json['followUp'] == null
      ? null
      : StaffFollowUpDto.fromJson(json['followUp'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffDecideResultDtoToJson(
  StaffDecideResultDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'status': instance.status.toJson(),
  'decision': instance.decision.toJson(),
  'decidedAt': instance.decidedAt.toIso8601String(),
  'followUp': ?instance.followUp?.toJson(),
};
