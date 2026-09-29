// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_language_dto.g.dart';

@JsonSerializable()
class UpdateLanguageDto {
  const UpdateLanguageDto({this.isActive, this.sort});

  factory UpdateLanguageDto.fromJson(Map<String, Object?> json) =>
      _$UpdateLanguageDtoFromJson(json);

  final bool? isActive;
  final int? sort;

  Map<String, Object?> toJson() => _$UpdateLanguageDtoToJson(this);
}
