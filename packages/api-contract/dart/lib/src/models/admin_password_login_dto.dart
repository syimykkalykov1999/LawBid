// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_password_login_dto.g.dart';

@JsonSerializable()
class AdminPasswordLoginDto {
  const AdminPasswordLoginDto({required this.login, required this.password});

  factory AdminPasswordLoginDto.fromJson(Map<String, Object?> json) =>
      _$AdminPasswordLoginDtoFromJson(json);

  final String login;
  final String password;

  Map<String, Object?> toJson() => _$AdminPasswordLoginDtoToJson(this);
}
