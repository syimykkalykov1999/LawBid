// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'partner_texts_dto.g.dart';

@JsonSerializable()
class PartnerTextsDto {
  const PartnerTextsDto({required this.title, required this.summary});

  factory PartnerTextsDto.fromJson(Map<String, Object?> json) =>
      _$PartnerTextsDtoFromJson(json);

  final String title;
  final String summary;

  Map<String, Object?> toJson() => _$PartnerTextsDtoToJson(this);
}
