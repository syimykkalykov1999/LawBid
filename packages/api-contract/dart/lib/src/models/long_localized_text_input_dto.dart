// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'long_localized_text_input_dto.g.dart';

@JsonSerializable()
class LongLocalizedTextInputDto {
  const LongLocalizedTextInputDto({this.en, this.ru});

  factory LongLocalizedTextInputDto.fromJson(Map<String, Object?> json) =>
      _$LongLocalizedTextInputDtoFromJson(json);

  final String? en;
  final String? ru;

  Map<String, Object?> toJson() => _$LongLocalizedTextInputDtoToJson(this);
}
