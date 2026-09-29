// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contact_method.dart';
import 'verification_status.dart';

part 'me_profile_dto.g.dart';

@JsonSerializable()
class MeProfileDto {
  const MeProfileDto({
    required this.languages,
    this.stateCode,
    this.contactMethod,
    this.contactNote,
    this.username,
    this.bio,
    this.firmName,
    this.licensedStates,
    this.verificationStatus,
  });

  factory MeProfileDto.fromJson(Map<String, Object?> json) =>
      _$MeProfileDtoFromJson(json);

  /// Client: state of residence (USPS code).
  final String? stateCode;

  /// ISO 639-1 codes (client preferred / attorney spoken).
  final List<String> languages;

  /// Client only.
  final ContactMethod? contactMethod;

  /// Client only.
  final String? contactNote;

  /// The @username (both roles since OQ-026).
  final String? username;

  /// Attorney only.
  final String? bio;

  /// Attorney only.
  final String? firmName;

  /// Attorney only: USPS codes of licensed states.
  final List<String>? licensedStates;

  /// Attorney only.
  final VerificationStatus? verificationStatus;

  Map<String, Object?> toJson() => _$MeProfileDtoToJson(this);
}
