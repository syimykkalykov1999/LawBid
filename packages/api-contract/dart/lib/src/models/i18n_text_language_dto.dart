// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'i18n_text_language_dto.g.dart';

@JsonSerializable()
class I18nTextLanguageDto {
  const I18nTextLanguageDto({required this.code, required this.name});

  factory I18nTextLanguageDto.fromJson(Map<String, Object?> json) =>
      _$I18nTextLanguageDtoFromJson(json);

  final String code;
  final String name;

  Map<String, Object?> toJson() => _$I18nTextLanguageDtoToJson(this);
}
