// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cost_ladder_day_one_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CostLadderDayOneDto _$CostLadderDayOneDtoFromJson(Map<String, dynamic> json) =>
    CostLadderDayOneDto(
      aws: (json['aws'] as List<dynamic>).map((e) => e as num).toList(),
      vendors: (json['vendors'] as List<dynamic>).map((e) => e as num).toList(),
      all: (json['all'] as List<dynamic>).map((e) => e as num).toList(),
    );

Map<String, dynamic> _$CostLadderDayOneDtoToJson(
  CostLadderDayOneDto instance,
) => <String, dynamic>{
  'aws': instance.aws,
  'vendors': instance.vendors,
  'all': instance.all,
};
