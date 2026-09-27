// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_profile_dto_theme.dart';

part 'update_profile_dto.g.dart';

@JsonSerializable()
class UpdateProfileDto {
  const UpdateProfileDto({
    this.firstName,
    this.lastName,
    this.uiLanguage,
    this.theme,
  });

  factory UpdateProfileDto.fromJson(Map<String, Object?> json) =>
      _$UpdateProfileDtoFromJson(json);

  final String? firstName;
  final String? lastName;
  final String? uiLanguage;
  final UpdateProfileDtoTheme? theme;

  Map<String, Object?> toJson() => _$UpdateProfileDtoToJson(this);
}
