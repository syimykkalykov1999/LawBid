// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'translatable_kind.dart';

part 'translate_content_dto.g.dart';

@JsonSerializable()
class TranslateContentDto {
  const TranslateContentDto({
    required this.kind,
    required this.id,
    required this.target,
  });

  factory TranslateContentDto.fromJson(Map<String, Object?> json) =>
      _$TranslateContentDtoFromJson(json);

  /// post / comment: the post or comment text; case: the description; bid: the bid message; review: the review text; profile: the attorney bio (id = the attorney user id).
  final TranslatableKind kind;
  final String id;

  /// Target language, ISO 639-1 (or zh-CN / zh-TW), e.g. "ru".
  final String target;

  Map<String, Object?> toJson() => _$TranslateContentDtoToJson(this);
}
