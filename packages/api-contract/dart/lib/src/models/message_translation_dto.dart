// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'message_translation_dto.g.dart';

@JsonSerializable()
class MessageTranslationDto {
  const MessageTranslationDto({
    required this.text,
    required this.sourceLanguage,
    required this.targetLanguage,
  });

  factory MessageTranslationDto.fromJson(Map<String, Object?> json) =>
      _$MessageTranslationDtoFromJson(json);

  /// The translated text.
  final String text;

  /// Detected language of the original.
  final String? sourceLanguage;
  final String targetLanguage;

  Map<String, Object?> toJson() => _$MessageTranslationDtoToJson(this);
}
