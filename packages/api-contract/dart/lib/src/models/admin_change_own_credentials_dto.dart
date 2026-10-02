// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_change_own_credentials_dto.g.dart';

@JsonSerializable()
class AdminChangeOwnCredentialsDto {
  const AdminChangeOwnCredentialsDto({
    this.currentPassword,
    this.newLogin,
    this.newPassword,
  });

  factory AdminChangeOwnCredentialsDto.fromJson(Map<String, Object?> json) =>
      _$AdminChangeOwnCredentialsDtoFromJson(json);

  /// Required when a password is already set.
  final String? currentPassword;
  final String? newLogin;
  final String? newPassword;

  Map<String, Object?> toJson() => _$AdminChangeOwnCredentialsDtoToJson(this);
}
