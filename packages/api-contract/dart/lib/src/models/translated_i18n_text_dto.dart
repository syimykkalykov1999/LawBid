// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'translated_i18n_text_dto.g.dart';

@JsonSerializable()
class TranslatedI18nTextDto {
  const TranslatedI18nTextDto({required this.values, required this.failed});

  factory TranslatedI18nTextDto.fromJson(Map<String, Object?> json) =>
      _$TranslatedI18nTextDtoFromJson(json);

  /// lang → machine translation
  final Map<String, String> values;

  /// Languages that failed.
  final List<String> failed;

  Map<String, Object?> toJson() => _$TranslatedI18nTextDtoToJson(this);
}
