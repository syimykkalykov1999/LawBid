// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_recover_password_dto.g.dart';

@JsonSerializable()
class AdminRecoverPasswordDto {
  const AdminRecoverPasswordDto({
    required this.login,
    required this.answer,
    required this.newPassword,
  });

  factory AdminRecoverPasswordDto.fromJson(Map<String, Object?> json) =>
      _$AdminRecoverPasswordDtoFromJson(json);

  final String login;
  final String answer;
  final String newPassword;

  Map<String, Object?> toJson() => _$AdminRecoverPasswordDtoToJson(this);
}
