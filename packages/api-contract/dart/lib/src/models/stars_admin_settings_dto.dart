// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'star_pack_dto.dart';

part 'stars_admin_settings_dto.g.dart';

@JsonSerializable()
class StarsAdminSettingsDto {
  const StarsAdminSettingsDto({
    required this.packs,
    required this.enabled,
    required this.giftConvertPercent,
    required this.giftsPerDayMax,
    required this.starCents,
    required this.reactionStars,
    required this.premiumReactions,
  });

  factory StarsAdminSettingsDto.fromJson(Map<String, Object?> json) =>
      _$StarsAdminSettingsDtoFromJson(json);

  final List<StarPackDto> packs;
  final bool enabled;
  final int giftConvertPercent;
  final int giftsPerDayMax;

  /// US cents one star is worth when a Boost is paid in stars.
  final int starCents;

  /// Stars one premium reaction costs.
  final int reactionStars;
  final List<String> premiumReactions;

  Map<String, Object?> toJson() => _$StarsAdminSettingsDtoToJson(this);
}
