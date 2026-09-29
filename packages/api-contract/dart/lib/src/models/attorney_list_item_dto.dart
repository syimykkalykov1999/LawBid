// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'rating_dto.dart';

part 'attorney_list_item_dto.g.dart';

@JsonSerializable()
class AttorneyListItemDto {
  const AttorneyListItemDto({
    required this.id,
    required this.username,
    required this.verifiedBadge,
    required this.rating,
    required this.states,
    required this.practiceI18nKeys,
    required this.isFollowing,
    this.firstName,
    this.lastName,
    this.avatarUrl,
  });

  factory AttorneyListItemDto.fromJson(Map<String, Object?> json) =>
      _$AttorneyListItemDtoFromJson(json);

  final String id;
  final String username;
  final String? firstName;
  final String? lastName;
  final String? avatarUrl;
  final bool verifiedBadge;
  final RatingDto rating;

  /// Verified license state codes.
  final List<String> states;

  /// i18n keys of the first practices (docs/05 §7.3).
  final List<String> practiceI18nKeys;

  /// The viewer follows this attorney.
  final bool isFollowing;

  Map<String, Object?> toJson() => _$AttorneyListItemDtoToJson(this);
}
