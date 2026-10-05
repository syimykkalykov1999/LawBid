// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'localized_text_input_dto.g.dart';

@JsonSerializable()
class LocalizedTextInputDto {
  const LocalizedTextInputDto({this.en, this.ru});

  factory LocalizedTextInputDto.fromJson(Map<String, Object?> json) =>
      _$LocalizedTextInputDtoFromJson(json);

  final String? en;
  final String? ru;

  Map<String, Object?> toJson() => _$LocalizedTextInputDtoToJson(this);
}
