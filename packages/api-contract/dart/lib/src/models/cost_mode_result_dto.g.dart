// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cost_mode_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CostModeResultDto _$CostModeResultDtoFromJson(Map<String, dynamic> json) =>
    CostModeResultDto(
      id: json['id'] as String,
      state: CostModeResultDtoState.fromJson(json['state'] as String),
    );

Map<String, dynamic> _$CostModeResultDtoToJson(CostModeResultDto instance) =>
    <String, dynamic>{'id': instance.id, 'state': instance.state.toJson()};
