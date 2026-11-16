// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'autoscale_knob_dto_kind.dart';

part 'autoscale_knob_dto.g.dart';

@JsonSerializable()
class AutoscaleKnobDto {
  const AutoscaleKnobDto({
    required this.key,
    required this.ru,
    required this.min,
    required this.max,
    required this.kind,
    required this.value,
  });

  factory AutoscaleKnobDto.fromJson(Map<String, Object?> json) =>
      _$AutoscaleKnobDtoFromJson(json);

  final String key;
  final String ru;
  final num min;
  final num max;
  final AutoscaleKnobDtoKind kind;
  final num? value;

  Map<String, Object?> toJson() => _$AutoscaleKnobDtoToJson(this);
}
