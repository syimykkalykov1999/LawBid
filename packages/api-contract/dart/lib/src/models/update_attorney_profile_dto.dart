// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_attorney_profile_dto_languages.dart';

part 'update_attorney_profile_dto.g.dart';

@JsonSerializable()
class UpdateAttorneyProfileDto {
  const UpdateAttorneyProfileDto({
    this.firstName,
    this.lastName,
    this.bio,
    this.firmName,
    this.languages,
    this.username,
  });

  factory UpdateAttorneyProfileDto.fromJson(Map<String, Object?> json) =>
      _$UpdateAttorneyProfileDtoFromJson(json);

  final String? firstName;
  final String? lastName;
  final String? bio;
  final String? firmName;
  final List<UpdateAttorneyProfileDtoLanguages>? languages;

  /// 3-30 latin letters, digits, `_` and `.`; not starting/ending with.
  /// `.`/`_`; no `..`. Uniqueness is case-insensitive.
  final String? username;

  Map<String, Object?> toJson() => _$UpdateAttorneyProfileDtoToJson(this);
}
