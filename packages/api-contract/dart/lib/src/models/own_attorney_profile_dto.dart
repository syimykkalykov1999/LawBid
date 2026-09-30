// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'own_license_dto.dart';
import 'profile_counters_dto.dart';
import 'rating_dto.dart';
import 'verification_status.dart';

part 'own_attorney_profile_dto.g.dart';

@JsonSerializable()
class OwnAttorneyProfileDto {
  const OwnAttorneyProfileDto({
    required this.id,
    required this.username,
    required this.firstName,
    required this.lastName,
    required this.bio,
    required this.firmName,
    required this.firms,
    required this.languages,
    required this.verificationStatus,
    required this.verifiedBadge,
    required this.usernameChangedAt,
    required this.usernameNextChangeAt,
    required this.licenses,
    required this.rating,
    required this.counters,
  });

  factory OwnAttorneyProfileDto.fromJson(Map<String, Object?> json) =>
      _$OwnAttorneyProfileDtoFromJson(json);

  final String id;
  final String username;
  final String? firstName;
  final String? lastName;
  final String? bio;
  final String? firmName;

  /// OQ-030: all firms (the first equals firmName).
  final List<String> firms;

  /// ISO 639-1 codes.
  final List<String> languages;
  final VerificationStatus verificationStatus;

  /// Blue check (docs/03 §6.3): verified status and at least one verified license.
  final bool verifiedBadge;
  final DateTime? usernameChangedAt;

  /// When the username may be changed again; null = it can be changed now.
  final DateTime? usernameNextChangeAt;
  final List<OwnLicenseDto> licenses;
  final RatingDto rating;
  final ProfileCountersDto counters;

  Map<String, Object?> toJson() => _$OwnAttorneyProfileDtoToJson(this);
}
