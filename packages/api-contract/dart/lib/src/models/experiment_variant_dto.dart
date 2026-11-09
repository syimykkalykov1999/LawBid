// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'experiment_variant_dto.g.dart';

@JsonSerializable()
class ExperimentVariantDto {
  const ExperimentVariantDto({
    required this.key,
    required this.weight,
    this.weights,
  });

  factory ExperimentVariantDto.fromJson(Map<String, Object?> json) =>
      _$ExperimentVariantDtoFromJson(json);

  final String key;
  final int weight;

  /// Formula weight overrides this variant applies on its surface (e.g. case_feed: { urgency: 0.3 }); control has none.
  final Map<String, num>? weights;

  Map<String, Object?> toJson() => _$ExperimentVariantDtoToJson(this);
}
