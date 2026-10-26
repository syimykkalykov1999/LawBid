// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'partner_texts_dto.dart';

part 'partner_texts_by_lang_dto.g.dart';

@JsonSerializable()
class PartnerTextsByLangDto {
  const PartnerTextsByLangDto({required this.en, required this.ru});

  factory PartnerTextsByLangDto.fromJson(Map<String, Object?> json) =>
      _$PartnerTextsByLangDtoFromJson(json);

  final PartnerTextsDto en;
  final PartnerTextsDto ru;

  Map<String, Object?> toJson() => _$PartnerTextsByLangDtoToJson(this);
}
