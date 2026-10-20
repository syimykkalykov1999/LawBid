// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'grant_stars_dto.g.dart';

@JsonSerializable()
class GrantStarsDto {
  const GrantStarsDto({
    required this.userId,
    required this.amount,
    required this.reason,
  });

  factory GrantStarsDto.fromJson(Map<String, Object?> json) =>
      _$GrantStarsDtoFromJson(json);

  final String userId;

  /// Positive adds, negative takes back (never below zero).
  final int amount;
  final String reason;

  Map<String, Object?> toJson() => _$GrantStarsDtoToJson(this);
}
