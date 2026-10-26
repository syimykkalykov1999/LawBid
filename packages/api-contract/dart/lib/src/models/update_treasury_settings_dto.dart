// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_treasury_settings_dto.g.dart';

@JsonSerializable()
class UpdateTreasurySettingsDto {
  const UpdateTreasurySettingsDto({
    this.auto,
    this.payoutDay,
    this.bufferPercent,
    this.refundBufferUsd,
    this.minProfitUsd,
    this.payrollAuto,
    this.payrollDay,
    this.payrollWarnDays,
  });

  factory UpdateTreasurySettingsDto.fromJson(Map<String, Object?> json) =>
      _$UpdateTreasurySettingsDtoFromJson(json);

  final bool? auto;
  final int? payoutDay;
  final int? bufferPercent;
  final int? refundBufferUsd;
  final int? minProfitUsd;
  final bool? payrollAuto;
  final int? payrollDay;
  final int? payrollWarnDays;

  Map<String, Object?> toJson() => _$UpdateTreasurySettingsDtoToJson(this);
}
