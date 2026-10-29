// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reset_i18n_text_dto.g.dart';

@JsonSerializable()
class ResetI18nTextDto {
  const ResetI18nTextDto({
    required this.key,
    this.lang,
  });
  
  factory ResetI18nTextDto.fromJson(Map<String, Object?> json) => _$ResetI18nTextDtoFromJson(json);
  
  final String key;

  /// Omit for every language.
  final String? lang;

  Map<String, Object?> toJson() => _$ResetI18nTextDtoToJson(this);
}
