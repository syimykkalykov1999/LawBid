// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_texts_dto.dart';

part 'legal_texts_by_lang_dto.g.dart';

@JsonSerializable()
class LegalTextsByLangDto {
  const LegalTextsByLangDto({required this.en, required this.ru});

  factory LegalTextsByLangDto.fromJson(Map<String, Object?> json) =>
      _$LegalTextsByLangDtoFromJson(json);

  final LegalTextsDto en;
  final LegalTextsDto ru;

  Map<String, Object?> toJson() => _$LegalTextsByLangDtoToJson(this);
}
