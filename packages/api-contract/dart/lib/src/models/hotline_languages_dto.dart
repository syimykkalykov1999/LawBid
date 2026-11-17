// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_languages_dto.g.dart';

@JsonSerializable()
class HotlineLanguagesDto {
  const HotlineLanguagesDto({required this.languages});

  factory HotlineLanguagesDto.fromJson(Map<String, Object?> json) =>
      _$HotlineLanguagesDtoFromJson(json);

  final List<String> languages;

  Map<String, Object?> toJson() => _$HotlineLanguagesDtoToJson(this);
}
