// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_hotline_addon_dto.g.dart';

@JsonSerializable()
class SetHotlineAddonDto {
  const SetHotlineAddonDto({required this.enabled, this.prorationDate});

  factory SetHotlineAddonDto.fromJson(Map<String, Object?> json) =>
      _$SetHotlineAddonDtoFromJson(json);

  /// true = add it (the prorated rest of the period is charged now); false = remove it (no refund, usable until the period end).
  final bool enabled;

  /// `prorationDate` from POST /subscriptions/hotline/preview, so the charge equals the amount shown (unix seconds; now when absent).
  final int? prorationDate;

  Map<String, Object?> toJson() => _$SetHotlineAddonDtoToJson(this);
}
