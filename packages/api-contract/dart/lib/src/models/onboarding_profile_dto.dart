// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'onboarding_profile_dto_contact_method.dart';
import 'onboarding_profile_dto_languages.dart';

part 'onboarding_profile_dto.g.dart';

@JsonSerializable()
class OnboardingProfileDto {
  const OnboardingProfileDto({
    this.firstName,
    this.lastName,
    this.stateCode,
    this.languages,
    this.contactMethod,
    this.contactNote,
    this.bio,
    this.firmName,
    this.licensedStates,
  });

  factory OnboardingProfileDto.fromJson(Map<String, Object?> json) =>
      _$OnboardingProfileDtoFromJson(json);

  final String? firstName;
  final String? lastName;

  /// Client: state of residence (50 + DC).
  final String? stateCode;

  /// Client preferred_languages / attorney languages — ISO 639-1.
  final List<OnboardingProfileDtoLanguages>? languages;
  final OnboardingProfileDtoContactMethod? contactMethod;
  final String? contactNote;
  final String? bio;
  final String? firmName;

  /// Attorney: states where they hold a license (multi-select). Bar.
  /// numbers are collected on verification (docs/03), so these are not.
  /// attorney_licenses rows yet.
  final List<String>? licensedStates;

  Map<String, Object?> toJson() => _$OnboardingProfileDtoToJson(this);
}
