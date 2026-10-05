// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'partner_me_texts_dto.g.dart';

@JsonSerializable()
class PartnerMeTextsDto {
  const PartnerMeTextsDto({
    required this.title,
    required this.summary,
    required this.disclosure,
    required this.terms,
  });

  factory PartnerMeTextsDto.fromJson(Map<String, Object?> json) =>
      _$PartnerMeTextsDtoFromJson(json);

  final String title;
  final String summary;

  /// Say it is a paid link in every post (FTC Endorsement Guides).
  final String disclosure;

  /// The partner rules, plain text.
  final String terms;

  Map<String, Object?> toJson() => _$PartnerMeTextsDtoToJson(this);
}
