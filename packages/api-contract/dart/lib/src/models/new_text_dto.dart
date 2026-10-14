// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'new_text_dto.g.dart';

@JsonSerializable()
class NewTextDto {
  const NewTextDto({required this.en, required this.ru});

  factory NewTextDto.fromJson(Map<String, Object?> json) =>
      _$NewTextDtoFromJson(json);

  final String en;
  final String ru;

  Map<String, Object?> toJson() => _$NewTextDtoToJson(this);
}
