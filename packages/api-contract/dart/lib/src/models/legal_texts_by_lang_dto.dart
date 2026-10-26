// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_texts_dto.dart';

part 'legal_texts_by_lang_dto.g.dart';

@JsonSerializable()
class LegalTextsByLangDto {
  const LegalTextsByLangDto({
    required this.en,
    required this.ru,
    this.es,
    this.fr,
    this.de,
    this.it,
    this.pt,
    this.nl,
    this.pl,
    this.uk,
  });

  factory LegalTextsByLangDto.fromJson(Map<String, Object?> json) =>
      _$LegalTextsByLangDtoFromJson(json);

  final LegalTextsDto en;
  final LegalTextsDto ru;

  /// Machine translation unless the owner edited it.
  final LegalTextsDto? es;

  /// Machine translation unless the owner edited it.
  final LegalTextsDto? fr;

  /// Machine translation unless the owner edited it.
  final LegalTextsDto? de;

  /// Machine translation unless the owner edited it.
  final LegalTextsDto? it;

  /// Machine translation unless the owner edited it.
  final LegalTextsDto? pt;

  /// Machine translation unless the owner edited it.
  final LegalTextsDto? nl;

  /// Machine translation unless the owner edited it.
  final LegalTextsDto? pl;

  /// Machine translation unless the owner edited it.
  final LegalTextsDto? uk;

  Map<String, Object?> toJson() => _$LegalTextsByLangDtoToJson(this);
}
