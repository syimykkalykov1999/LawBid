// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'i18n_text_language_dto.dart';
import 'i18n_text_row_dto.dart';

part 'i18n_texts_dto.g.dart';

@JsonSerializable()
class I18nTextsDto {
  const I18nTextsDto({required this.languages, required this.keys});

  factory I18nTextsDto.fromJson(Map<String, Object?> json) =>
      _$I18nTextsDtoFromJson(json);

  final List<I18nTextLanguageDto> languages;
  final List<I18nTextRowDto> keys;

  Map<String, Object?> toJson() => _$I18nTextsDtoToJson(this);
}
