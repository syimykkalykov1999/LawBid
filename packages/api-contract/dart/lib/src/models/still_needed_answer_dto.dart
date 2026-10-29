// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'still_needed_answer.dart';

part 'still_needed_answer_dto.g.dart';

@JsonSerializable()
class StillNeededAnswerDto {
  const StillNeededAnswerDto({
    required this.answer,
  });
  
  factory StillNeededAnswerDto.fromJson(Map<String, Object?> json) => _$StillNeededAnswerDtoFromJson(json);
  
  /// «Да, нужен» / «Жду предложений получше» / «Уже не нужен» (closes the case) / «Сменить на «Не срочно»».
  final StillNeededAnswer answer;

  Map<String, Object?> toJson() => _$StillNeededAnswerDtoToJson(this);
}
