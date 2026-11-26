// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_recover_question_dto.g.dart';

@JsonSerializable()
class AdminRecoverQuestionDto {
  const AdminRecoverQuestionDto({required this.login, this.code});

  factory AdminRecoverQuestionDto.fromJson(Map<String, Object?> json) =>
      _$AdminRecoverQuestionDtoFromJson(json);

  final String login;

  /// The 6-digit authenticator code, or one recovery code (it is spent). Required by the server.
  final String? code;

  Map<String, Object?> toJson() => _$AdminRecoverQuestionDtoToJson(this);
}
