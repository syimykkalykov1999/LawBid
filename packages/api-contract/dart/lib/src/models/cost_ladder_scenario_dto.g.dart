// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cost_ladder_scenario_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CostLadderScenarioDto _$CostLadderScenarioDtoFromJson(
  Map<String, dynamic> json,
) => CostLadderScenarioDto(
  users: json['users'] as num,
  usd: (json['usd'] as List<dynamic>).map((e) => e as num).toList(),
);

Map<String, dynamic> _$CostLadderScenarioDtoToJson(
  CostLadderScenarioDto instance,
) => <String, dynamic>{'users': instance.users, 'usd': instance.usd};
