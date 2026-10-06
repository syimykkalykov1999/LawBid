// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'demo_banner_text_dto.g.dart';

@JsonSerializable()
class DemoBannerTextDto {
  const DemoBannerTextDto({required this.en, required this.ru});

  factory DemoBannerTextDto.fromJson(Map<String, Object?> json) =>
      _$DemoBannerTextDtoFromJson(json);

  final String en;
  final String ru;

  Map<String, Object?> toJson() => _$DemoBannerTextDtoToJson(this);
}
