// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'profile_counters_dto.dart';
import 'rating_dto.dart';
import 'selected_practice_area_dto.dart';
import 'state_ref_dto.dart';

part 'public_attorney_profile_dto.g.dart';

@JsonSerializable()
class PublicAttorneyProfileDto {
  const PublicAttorneyProfileDto({
    required this.id,
    required this.username,
    required this.firstName,
    required this.lastName,
    required this.bio,
    required this.firmName,
    required this.firms,
    required this.avatarUrl,
    required this.avatarUrl256,
    required this.languages,
    required this.verifiedBadge,
    required this.licensedStates,
    required this.practiceAreas,
    required this.rating,
    required this.counters,
    required this.isSelf,
    required this.isFollowing,
    required this.isBlocked,
    required this.hasBlockedMe,
  });

  factory PublicAttorneyProfileDto.fromJson(Map<String, Object?> json) =>
      _$PublicAttorneyProfileDtoFromJson(json);

  final String id;
  final String username;
  final String? firstName;
  final String? lastName;
  final String? bio;
  final String? firmName;

  /// OQ-030: all firms (the first equals firmName).
  final List<String> firms;

  /// Short-lived signed link to the attorney photo (1024 px JPEG); null when none.
  final String? avatarUrl;

  /// Signed link to the 256 px square variant; null when none.
  final String? avatarUrl256;
  final List<String> languages;

  /// Blue check (docs/03 §6.3).
  final bool verifiedBadge;

  /// States of verified licenses only.
  final List<StateRefDto> licensedStates;
  final List<SelectedPracticeAreaDto> practiceAreas;
  final RatingDto rating;
  final ProfileCountersDto counters;

  /// True when this is the caller's own profile.
  final bool isSelf;

  /// The viewer follows this attorney (docs/05 §6.2).
  final bool isFollowing;

  /// OQ-028: the viewer blocked this user.
  final bool isBlocked;

  /// OQ-028: this user blocked the viewer (no follow / message).
  final bool hasBlockedMe;

  Map<String, Object?> toJson() => _$PublicAttorneyProfileDtoToJson(this);
}
