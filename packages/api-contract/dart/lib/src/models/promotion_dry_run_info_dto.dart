// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'promotion_dry_run_info_dto.g.dart';

@JsonSerializable()
class PromotionDryRunInfoDto {
  const PromotionDryRunInfoDto({required this.canStart, required this.command});

  factory PromotionDryRunInfoDto.fromJson(Map<String, Object?> json) =>
      _$PromotionDryRunInfoDtoFromJson(json);

  /// The GitHub App is configured: the button can start it.
  final bool canStart;

  /// The command to run by hand.
  final String command;

  Map<String, Object?> toJson() => _$PromotionDryRunInfoDtoToJson(this);
}
