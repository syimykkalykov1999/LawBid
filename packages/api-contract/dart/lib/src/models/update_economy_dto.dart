// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_economy_dto_ceiling_mode.dart';

part 'update_economy_dto.g.dart';

@JsonSerializable()
class UpdateEconomyDto {
  const UpdateEconomyDto({
    this.percent,
    this.thresholdUsd,
    this.ceilingMode,
    this.manualApi,
    this.manualWorker,
    this.smsUnitUsd,
    this.videoUnitUsd,
    this.translateUnitUsd,
    this.awsFallbackUsd,
    this.guardEnabled,
  });

  factory UpdateEconomyDto.fromJson(Map<String, Object?> json) =>
      _$UpdateEconomyDtoFromJson(json);

  final num? percent;
  final num? thresholdUsd;
  final UpdateEconomyDtoCeilingMode? ceilingMode;
  final num? manualApi;
  final num? manualWorker;
  final num? smsUnitUsd;
  final num? videoUnitUsd;
  final num? translateUnitUsd;
  final num? awsFallbackUsd;

  /// The economy_guard flag (rollback).
  final bool? guardEnabled;

  Map<String, Object?> toJson() => _$UpdateEconomyDtoToJson(this);
}
