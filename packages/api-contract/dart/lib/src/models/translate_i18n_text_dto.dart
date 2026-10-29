// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'translate_i18n_text_dto.g.dart';

@JsonSerializable()
class TranslateI18nTextDto {
  const TranslateI18nTextDto({
    required this.text,
    required this.source,
  });
  
  factory TranslateI18nTextDto.fromJson(Map<String, Object?> json) => _$TranslateI18nTextDtoFromJson(json);
  
  /// The source text as edited.
  final String text;
  final String source;

  Map<String, Object?> toJson() => _$TranslateI18nTextDtoToJson(this);
}
