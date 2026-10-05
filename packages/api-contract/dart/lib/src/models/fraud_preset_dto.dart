// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fraud_preset.dart';

part 'fraud_preset_dto.g.dart';

@JsonSerializable()
class FraudPresetDto {
  const FraudPresetDto({required this.preset});

  factory FraudPresetDto.fromJson(Map<String, Object?> json) =>
      _$FraudPresetDtoFromJson(json);

  final FraudPreset preset;

  Map<String, Object?> toJson() => _$FraudPresetDtoToJson(this);
}
