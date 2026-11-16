// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'service_now_dto_kind.dart';

part 'service_now_dto.g.dart';

@JsonSerializable()
class ServiceNowDto {
  const ServiceNowDto({
    required this.kind,
    required this.running,
    required this.desired,
    required this.spot,
    this.baseValue,
    this.fargateWeight,
    this.spotWeight,
    this.min,
    this.max,
  });

  factory ServiceNowDto.fromJson(Map<String, Object?> json) =>
      _$ServiceNowDtoFromJson(json);

  final ServiceNowDtoKind kind;
  final num running;
  final num desired;

  /// Runs on Fargate Spot (null = the service does not say).
  final bool? spot;

  /// Regular Fargate tasks first (strategy base; null = launch type).
  /// The name has been replaced because it contains a keyword. Original name: `base`.
  @JsonKey(name: 'base')
  final num? baseValue;

  /// FARGATE weight of the strategy (null = launch type).
  final num? fargateWeight;

  /// FARGATE_SPOT weight of the strategy (null = launch type).
  final num? spotWeight;

  /// Autoscaling floor now (MinCapacity; null = not read).
  final num? min;

  /// Autoscaling ceiling now (MaxCapacity; null = not read).
  final num? max;

  Map<String, Object?> toJson() => _$ServiceNowDtoToJson(this);
}
