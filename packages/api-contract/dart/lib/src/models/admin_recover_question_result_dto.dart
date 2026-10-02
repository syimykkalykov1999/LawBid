// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_recover_question_result_dto.g.dart';

@JsonSerializable()
class AdminRecoverQuestionResultDto {
  const AdminRecoverQuestionResultDto({required this.question});

  factory AdminRecoverQuestionResultDto.fromJson(Map<String, Object?> json) =>
      _$AdminRecoverQuestionResultDtoFromJson(json);

  /// The super admin’s own security question (a neutral text for any other login).
  final String question;

  Map<String, Object?> toJson() => _$AdminRecoverQuestionResultDtoToJson(this);
}
