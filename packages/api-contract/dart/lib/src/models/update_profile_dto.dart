// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_profile_dto_theme.dart';

part 'update_profile_dto.g.dart';

@JsonSerializable()
class UpdateProfileDto {
  const UpdateProfileDto({
    this.avatarFileId,
    this.firstName,
    this.lastName,
    this.uiLanguage,
    this.theme,
    this.hideLikeCounts,
    this.email,
  });

  factory UpdateProfileDto.fromJson(Map<String, Object?> json) =>
      _$UpdateProfileDtoFromJson(json);

  /// docs/03 §4.1 photo (OQ-012 attorney onboarding photo step): a clean.
  /// `avatar` file from POST /files/presign + confirm; null removes it.
  final String? avatarFileId;
  final String? firstName;
  final String? lastName;
  final String? uiLanguage;
  final UpdateProfileDtoTheme? theme;

  /// Owner 2026-10-15: hide like counters under other people's posts.
  final bool? hideLikeCounts;

  /// Owner 2026-10-13: e-mail is a plain required profile field — format.
  /// only, no code is sent and it is not verified. Shared with the other.
  /// party when a case is accepted.
  final String? email;

  Map<String, Object?> toJson() => _$UpdateProfileDtoToJson(this);
}
