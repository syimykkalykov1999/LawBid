// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'billing_models_dto.dart';

part 'target_pricing_dto.g.dart';

@JsonSerializable()
class TargetPricingDto {
  const TargetPricingDto({required this.models, required this.actions});

  factory TargetPricingDto.fromJson(Map<String, Object?> json) =>
      _$TargetPricingDtoFromJson(json);

  final BillingModelsDto models;

  /// What counts as an action.
  final List<String> actions;

  Map<String, Object?> toJson() => _$TargetPricingDtoToJson(this);
}
