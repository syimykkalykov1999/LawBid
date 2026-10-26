// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'legal_texts_need_review_dto.g.dart';

@JsonSerializable()
class LegalTextsNeedReviewDto {
  const LegalTextsNeedReviewDto({
    this.en,
    this.ru,
    this.es,
    this.fr,
    this.de,
    this.it,
    this.pt,
    this.nl,
    this.pl,
    this.uk,
  });

  factory LegalTextsNeedReviewDto.fromJson(Map<String, Object?> json) =>
      _$LegalTextsNeedReviewDtoFromJson(json);

  final bool? en;
  final bool? ru;
  final bool? es;
  final bool? fr;
  final bool? de;
  final bool? it;
  final bool? pt;
  final bool? nl;
  final bool? pl;
  final bool? uk;

  Map<String, Object?> toJson() => _$LegalTextsNeedReviewDtoToJson(this);
}
