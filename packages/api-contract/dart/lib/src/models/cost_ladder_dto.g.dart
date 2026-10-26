// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cost_ladder_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CostLadderDto _$CostLadderDtoFromJson(Map<String, dynamic> json) =>
    CostLadderDto(
      dayOne: CostLadderDayOneDto.fromJson(
        json['dayOne'] as Map<String, dynamic>,
      ),
      scenarios: (json['scenarios'] as List<dynamic>)
          .map((e) => CostLadderScenarioDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      monthToDateUsd: json['monthToDateUsd'] as num?,
      projectedUsd: json['projectedUsd'] as num?,
    );

Map<String, dynamic> _$CostLadderDtoToJson(CostLadderDto instance) =>
    <String, dynamic>{
      'dayOne': instance.dayOne.toJson(),
      'scenarios': instance.scenarios.map((e) => e.toJson()).toList(),
      'monthToDateUsd': ?instance.monthToDateUsd,
      'projectedUsd': ?instance.projectedUsd,
    };
