// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_security_question_dto.g.dart';

@JsonSerializable()
class AdminSecurityQuestionDto {
  const AdminSecurityQuestionDto({
    required this.question,
    required this.answer,
  });

  factory AdminSecurityQuestionDto.fromJson(Map<String, Object?> json) =>
      _$AdminSecurityQuestionDtoFromJson(json);

  final String question;
  final String answer;

  Map<String, Object?> toJson() => _$AdminSecurityQuestionDtoToJson(this);
}
