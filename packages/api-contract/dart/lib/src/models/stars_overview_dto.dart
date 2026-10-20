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
  });

  factory StarsOverviewDto.fromJson(Map<String, Object?> json) =>
      _$StarsOverviewDtoFromJson(json);

  final bool enabled;
  final int balance;
  final List<StarPackDto> packs;

  /// Percent of a gift price a receiver gets turning it to stars.
  final int giftConvertPercent;

  Map<String, Object?> toJson() => _$StarsOverviewDtoToJson(this);
}
