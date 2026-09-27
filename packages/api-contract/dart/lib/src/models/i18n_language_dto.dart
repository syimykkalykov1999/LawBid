// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'i18n_language_dto.g.dart';

@JsonSerializable()
class I18nLanguageDto {
  const I18nLanguageDto({
    required this.code,
    required this.nameNative,
    required this.isActive,
    required this.isRtl,
    required this.sort,
  });

  factory I18nLanguageDto.fromJson(Map<String, Object?> json) =>
      _$I18nLanguageDtoFromJson(json);

  /// ISO 639-1 code.
  final String code;
  @JsonKey(name: 'name_native')
  final String nameNative;
  @JsonKey(name: 'is_active')
  final bool isActive;
  @JsonKey(name: 'is_rtl')
  final bool isRtl;
  final int sort;

  Map<String, Object?> toJson() => _$I18nLanguageDtoToJson(this);
}
