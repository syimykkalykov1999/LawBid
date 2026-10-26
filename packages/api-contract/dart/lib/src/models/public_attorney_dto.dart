// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'public_practice_dto.dart';

part 'public_attorney_dto.g.dart';

@JsonSerializable()
class PublicAttorneyDto {
  const PublicAttorneyDto({
    required this.username,
    required this.displayName,
    required this.firmNames,
    required this.languages,
    required this.ratingAvg,
    required this.ratingCount,
    required this.trustBadge,
    required this.photoUrl,
    required this.practiceAreas,
    required this.licensedStates,
    this.bio,
  });

  factory PublicAttorneyDto.fromJson(Map<String, Object?> json) =>
      _$PublicAttorneyDtoFromJson(json);

  final String username;
  final String displayName;
  final String? bio;
  final List<String> firmNames;
  final List<String> languages;
  final num ratingAvg;
  final num ratingCount;

  /// The blue check: license and identity confirmed.
  final bool trustBadge;

  /// Owner 2026-10-22 (audit #4 §9): the attorney's photo on the media CDN.
  /// (og:image of the SEO page); null without a CDN, a photo, or when the.
  /// photo is not shown to everyone.
  final String? photoUrl;
  final List<PublicPracticeDto> practiceAreas;

  /// States of verified licenses.
  final List<String> licensedStates;

  Map<String, Object?> toJson() => _$PublicAttorneyDtoToJson(this);
}
