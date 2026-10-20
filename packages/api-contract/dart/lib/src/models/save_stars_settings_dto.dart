// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'star_pack_dto.dart';

part 'save_stars_settings_dto.g.dart';

@JsonSerializable()
class SaveStarsSettingsDto {
  const SaveStarsSettingsDto({
    required this.packs,
    required this.giftConvertPercent,
    required this.giftsPerDayMax,
    this.starCents,
    this.reactionStars,
    this.premiumReactions,
  });

  factory SaveStarsSettingsDto.fromJson(Map<String, Object?> json) =>
      _$SaveStarsSettingsDtoFromJson(json);

  final List<StarPackDto> packs;
  final int giftConvertPercent;
  final int giftsPerDayMax;
  final int? starCents;
  final int? reactionStars;
  final List<String>? premiumReactions;

  Map<String, Object?> toJson() => _$SaveStarsSettingsDtoToJson(this);
}
