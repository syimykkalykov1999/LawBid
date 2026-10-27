// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'infra_plan_resource_dto.dart';

part 'infra_plan_dto.g.dart';

@JsonSerializable()
class InfraPlanDto {
  const InfraPlanDto({
    required this.add,
    required this.change,
    required this.destroy,
    required this.resources,
  });

  factory InfraPlanDto.fromJson(Map<String, Object?> json) =>
      _$InfraPlanDtoFromJson(json);

  final num add;
  final num change;
  final num destroy;
  final List<InfraPlanResourceDto> resources;

  Map<String, Object?> toJson() => _$InfraPlanDtoToJson(this);
}
