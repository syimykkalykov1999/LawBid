// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_login_verify_dto.g.dart';

@JsonSerializable()
class AdminLoginVerifyDto {
  const AdminLoginVerifyDto({required this.email, required this.code});

  factory AdminLoginVerifyDto.fromJson(Map<String, Object?> json) =>
      _$AdminLoginVerifyDtoFromJson(json);

  final String email;

  /// The 6-digit code from the email.
  final String code;

  Map<String, Object?> toJson() => _$AdminLoginVerifyDtoToJson(this);
}
