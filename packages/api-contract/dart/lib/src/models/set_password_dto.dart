// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_password_dto.g.dart';

@JsonSerializable()
class SetPasswordDto {
  const SetPasswordDto({
    required this.password,
    this.currentPassword,
  });
  
  factory SetPasswordDto.fromJson(Map<String, Object?> json) => _$SetPasswordDtoFromJson(json);
  
  final String password;

  /// Required only when the account already has a password.
  final String? currentPassword;

  Map<String, Object?> toJson() => _$SetPasswordDtoToJson(this);
}
