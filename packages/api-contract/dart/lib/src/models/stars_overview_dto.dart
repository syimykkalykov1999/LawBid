// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'star_pack_dto.dart';

part 'stars_overview_dto.g.dart';

@JsonSerializable()
class StarsOverviewDto {
  const StarsOverviewDto({
    required this.enabled,
    required this.balance,
    required this.packs,
    required this.giftConvertPercent,
    required this.starCents,
    required this.reactionStars,
    required this.premiumReactions,
    required this.freeReactions,
  });

  factory StarsOverviewDto.fromJson(Map<String, Object?> json) =>
      _$StarsOverviewDtoFromJson(json);

  final bool enabled;
  final int balance;
  final List<StarPackDto> packs;

  /// Percent of a gift price a receiver gets turning it to stars.
  final int giftConvertPercent;

  /// Cents one star is worth (Boost price conversion).
  final int starCents;

  /// Stars a premium reaction costs.
  final int reactionStars;

  /// Reactions charged in stars.
  final List<String> premiumReactions;

  /// Reactions free for everyone.
  final List<String> freeReactions;

  Map<String, Object?> toJson() => _$StarsOverviewDtoToJson(this);
}
