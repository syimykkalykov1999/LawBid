// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'best_answer_dto.g.dart';

@JsonSerializable()
class BestAnswerDto {
  const BestAnswerDto({required this.answerId});

  factory BestAnswerDto.fromJson(Map<String, Object?> json) =>
      _$BestAnswerDtoFromJson(json);

  final String answerId;

  Map<String, Object?> toJson() => _$BestAnswerDtoToJson(this);
}
