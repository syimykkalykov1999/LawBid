// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'answer_body_dto.g.dart';

@JsonSerializable()
class AnswerBodyDto {
  const AnswerBodyDto({required this.body});

  factory AnswerBodyDto.fromJson(Map<String, Object?> json) =>
      _$AnswerBodyDtoFromJson(json);

  final String body;

  Map<String, Object?> toJson() => _$AnswerBodyDtoToJson(this);
}
