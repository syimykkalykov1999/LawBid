// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_decide_appeal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffDecideAppealDto _$StaffDecideAppealDtoFromJson(
  Map<String, dynamic> json,
) => StaffDecideAppealDto(
  decision: StaffDecideAppealDtoDecision.fromJson(json['decision'] as String),
  note: json['note'] as String?,
);

Map<String, dynamic> _$StaffDecideAppealDtoToJson(
  StaffDecideAppealDto instance,
) => <String, dynamic>{
  'decision': instance.decision.toJson(),
  'note': ?instance.note,
};
