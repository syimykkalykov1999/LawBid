// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'state_ref_dto.dart';

part 'public_client_profile_dto.g.dart';

@JsonSerializable()
class PublicClientProfileDto {
  const PublicClientProfileDto({
    required this.id,
    required this.username,
    required this.firstName,
    required this.lastName,
    required this.avatarUrl,
    required this.state,
    required this.memberSince,
    required this.isSelf,
    required this.verifiedBadge,
    required this.isBlocked,
    required this.hasBlockedMe,
    required this.postsCount,
    required this.followersCount,
    required this.followingCount,
    required this.isFollowing,
    required this.canSeeReviews,
    required this.ratingCount,
    this.ratingAvg,
  });

  factory PublicClientProfileDto.fromJson(Map<String, Object?> json) =>
      _$PublicClientProfileDtoFromJson(json);

  final String id;
  final String username;
  final String? firstName;
  final String? lastName;
  final String? avatarUrl;
  final StateRefDto state;

  /// ISO date of registration (YYYY-MM-DD).
  final String memberSince;
  final bool isSelf;

  /// OQ-029 final: blue check = the client confirmed a phone number.
  final bool verifiedBadge;

  /// OQ-028: the viewer blocked this user.
  final bool isBlocked;

  /// OQ-028: this user blocked the viewer.
  final bool hasBlockedMe;

  /// OQ-038: Instagram-like counters.
  final int postsCount;
  final int followersCount;
  final int followingCount;
  final bool isFollowing;

  /// OQ-038: attorneys' reviews of this client are visible to attorneys.
  /// and to the client; other clients get false and no rating.
  final bool canSeeReviews;
  final num? ratingAvg;
  final int ratingCount;

  Map<String, Object?> toJson() => _$PublicClientProfileDtoToJson(this);
}
