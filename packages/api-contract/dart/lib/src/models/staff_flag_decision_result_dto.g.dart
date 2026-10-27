// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_flag_decision_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffFlagDecisionResultDto _$StaffFlagDecisionResultDtoFromJson(
  Map<String, dynamic> json,
) => StaffFlagDecisionResultDto(
  id: json['id'] as String,
  state: StaffFlagDecisionResultDtoState.fromJson(json['state'] as String),
  reinstated: json['reinstated'] as bool,
);

Map<String, dynamic> _$StaffFlagDecisionResultDtoToJson(
  StaffFlagDecisionResultDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'state': instance.state.toJson(),
  'reinstated': instance.reinstated,
};
