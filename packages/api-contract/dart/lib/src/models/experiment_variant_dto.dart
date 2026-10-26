// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'experiment_variant_dto.g.dart';

@JsonSerializable()
class ExperimentVariantDto {
  const ExperimentVariantDto({required this.key, required this.weight});

  factory ExperimentVariantDto.fromJson(Map<String, Object?> json) =>
      _$ExperimentVariantDtoFromJson(json);

  final String key;
  final int weight;

  Map<String, Object?> toJson() => _$ExperimentVariantDtoToJson(this);
}
