// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'state_registry_dto_adapter.dart';

part 'state_registry_dto.g.dart';

@JsonSerializable()
class StateRegistryDto {
  const StateRegistryDto({
    required this.stateCode,
    required this.stateName,
    required this.adapter,
    required this.enabled,
    required this.config,
    required this.hasSecret,
    required this.secretMasked,
    required this.testBarNumber,
    required this.lastTestAt,
    required this.lastTestResult,
    required this.updatedAt,
  });

  factory StateRegistryDto.fromJson(Map<String, Object?> json) =>
      _$StateRegistryDtoFromJson(json);

  final String stateCode;
  final String stateName;
  final StateRegistryDtoAdapter adapter;

  /// Licenses of this state are checked automatically.
  final bool enabled;

  /// Non-secret settings of the adapter.
  final Map<String, String> config;
  final bool hasSecret;
  final String? secretMasked;
  final String? testBarNumber;
  final DateTime? lastTestAt;
  final dynamic lastTestResult;
  final DateTime? updatedAt;

  Map<String, Object?> toJson() => _$StateRegistryDtoToJson(this);
}
