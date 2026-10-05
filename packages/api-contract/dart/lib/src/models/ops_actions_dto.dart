// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ops_actions_dto.g.dart';

@JsonSerializable()
class OpsActionsDto {
  const OpsActionsDto({required this.onAws, required this.budget});

  factory OpsActionsDto.fromJson(Map<String, Object?> json) =>
      _$OpsActionsDtoFromJson(json);

  /// Restart worker / scale run here (on AWS).
  final bool onAws;

  /// This month’s spend is read from AWS Budgets.
  final bool budget;

  Map<String, Object?> toJson() => _$OpsActionsDtoToJson(this);
}
