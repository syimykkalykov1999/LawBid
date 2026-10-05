// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'localized_text_dto.g.dart';

@JsonSerializable()
class LocalizedTextDto {
  const LocalizedTextDto({this.en, this.ru});

  factory LocalizedTextDto.fromJson(Map<String, Object?> json) =>
      _$LocalizedTextDtoFromJson(json);

  final String? en;
  final String? ru;

  Map<String, Object?> toJson() => _$LocalizedTextDtoToJson(this);
}
