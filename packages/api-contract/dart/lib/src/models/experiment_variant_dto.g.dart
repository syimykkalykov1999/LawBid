// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'experiment_variant_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ExperimentVariantDto _$ExperimentVariantDtoFromJson(
  Map<String, dynamic> json,
) => ExperimentVariantDto(
  key: json['key'] as String,
  weight: (json['weight'] as num).toInt(),
);

Map<String, dynamic> _$ExperimentVariantDtoToJson(
  ExperimentVariantDto instance,
) => <String, dynamic>{'key': instance.key, 'weight': instance.weight};
