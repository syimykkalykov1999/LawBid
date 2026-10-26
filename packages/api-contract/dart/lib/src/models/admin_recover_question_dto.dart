// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_recover_question_dto.g.dart';

@JsonSerializable()
class AdminRecoverQuestionDto {
  const AdminRecoverQuestionDto({required this.login});

  factory AdminRecoverQuestionDto.fromJson(Map<String, Object?> json) =>
      _$AdminRecoverQuestionDtoFromJson(json);

  final String login;

  Map<String, Object?> toJson() => _$AdminRecoverQuestionDtoToJson(this);
}
