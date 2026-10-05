// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'recompute_all_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RecomputeAllResultDto _$RecomputeAllResultDtoFromJson(
  Map<String, dynamic> json,
) => RecomputeAllResultDto(
  attorneys: (json['attorneys'] as num).toInt(),
  changed: (json['changed'] as num).toInt(),
);

Map<String, dynamic> _$RecomputeAllResultDtoToJson(
  RecomputeAllResultDto instance,
) => <String, dynamic>{
  'attorneys': instance.attorneys,
  'changed': instance.changed,
};
