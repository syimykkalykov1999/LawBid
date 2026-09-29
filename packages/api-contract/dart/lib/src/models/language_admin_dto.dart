// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'language_admin_dto.g.dart';

@JsonSerializable()
class LanguageAdminDto {
  const LanguageAdminDto({
    required this.code,
    required this.nameNative,
    required this.isActive,
    required this.isRtl,
    required this.sort,
    required this.translations,
    required this.bundleVersion,
  });

  factory LanguageAdminDto.fromJson(Map<String, Object?> json) =>
      _$LanguageAdminDtoFromJson(json);

  final String code;
  final String nameNative;
  final bool isActive;
  final bool isRtl;
  final int sort;
  final int translations;

  /// Bundle version (0 = none yet).
  final int bundleVersion;

  Map<String, Object?> toJson() => _$LanguageAdminDtoToJson(this);
}
