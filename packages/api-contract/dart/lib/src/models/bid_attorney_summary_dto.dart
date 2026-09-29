// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'rating_dto.dart';

part 'bid_attorney_summary_dto.g.dart';

@JsonSerializable()
class BidAttorneySummaryDto {
  const BidAttorneySummaryDto({
    required this.id,
    required this.username,
    required this.firstName,
    required this.lastName,
    required this.avatarUrl256,
    required this.verifiedBadge,
    required this.rating,
  });

  factory BidAttorneySummaryDto.fromJson(Map<String, Object?> json) =>
      _$BidAttorneySummaryDtoFromJson(json);

  final String id;
  final String username;
  final String? firstName;
  final String? lastName;

  /// Signed link to the 256 px avatar; null when none.
  final String? avatarUrl256;

  /// Blue check (docs/03 §6.3).
  final bool verifiedBadge;
  final RatingDto rating;

  Map<String, Object?> toJson() => _$BidAttorneySummaryDtoToJson(this);
}
