// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'promotion_dry_run_result_dto.g.dart';

@JsonSerializable()
class PromotionDryRunResultDto {
  const PromotionDryRunResultDto({
    required this.started,
    required this.command,
    required this.runsUrl,
    required this.message,
  });

  factory PromotionDryRunResultDto.fromJson(Map<String, Object?> json) =>
      _$PromotionDryRunResultDtoFromJson(json);

  /// GitHub accepted the run.
  final bool started;
  final String command;
  final String? runsUrl;
  final String? message;

  Map<String, Object?> toJson() => _$PromotionDryRunResultDtoToJson(this);
}
