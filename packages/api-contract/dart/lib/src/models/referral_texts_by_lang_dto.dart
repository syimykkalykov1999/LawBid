// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'referral_texts_dto.dart';

part 'referral_texts_by_lang_dto.g.dart';

@JsonSerializable()
class ReferralTextsByLangDto {
  const ReferralTextsByLangDto({required this.en, required this.ru});

  factory ReferralTextsByLangDto.fromJson(Map<String, Object?> json) =>
      _$ReferralTextsByLangDtoFromJson(json);

  final ReferralTextsDto en;
  final ReferralTextsDto ru;

  Map<String, Object?> toJson() => _$ReferralTextsByLangDtoToJson(this);
}
