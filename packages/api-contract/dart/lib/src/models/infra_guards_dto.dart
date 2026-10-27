// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'infra_guards_dto.g.dart';

@JsonSerializable()
class InfraGuardsDto {
  const InfraGuardsDto({
    required this.dryRun,
    required this.dailyCap,
    required this.quietHours,
    required this.configured,
    required this.inQuietWindow,
  });

  factory InfraGuardsDto.fromJson(Map<String, Object?> json) =>
      _$InfraGuardsDtoFromJson(json);

  final bool dryRun;
  final num dailyCap;
  final String quietHours;
  final bool configured;
  final bool inQuietWindow;

  Map<String, Object?> toJson() => _$InfraGuardsDtoToJson(this);
}
