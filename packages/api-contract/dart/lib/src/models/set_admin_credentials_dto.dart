// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_admin_credentials_dto.g.dart';

@JsonSerializable()
class SetAdminCredentialsDto {
  const SetAdminCredentialsDto({this.login, this.password});

  factory SetAdminCredentialsDto.fromJson(Map<String, Object?> json) =>
      _$SetAdminCredentialsDtoFromJson(json);

  final String? login;
  final String? password;

  Map<String, Object?> toJson() => _$SetAdminCredentialsDtoToJson(this);
}
