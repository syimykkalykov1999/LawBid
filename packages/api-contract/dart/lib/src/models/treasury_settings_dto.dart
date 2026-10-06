// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'treasury_settings_dto.g.dart';

@JsonSerializable()
class TreasurySettingsDto {
  const TreasurySettingsDto({
    required this.auto,
    required this.payoutDay,
    required this.bufferPercent,
    required this.refundBufferUsd,
    required this.minProfitUsd,
  });

  factory TreasurySettingsDto.fromJson(Map<String, Object?> json) =>
      _$TreasurySettingsDtoFromJson(json);

  /// The split runs by itself every month.
  final bool auto;
  final int payoutDay;
  final int bufferPercent;
  final int refundBufferUsd;
  final int minProfitUsd;

  Map<String, Object?> toJson() => _$TreasurySettingsDtoToJson(this);
}
