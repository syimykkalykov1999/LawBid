// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reauth_dto_method.dart';

part 'reauth_dto.g.dart';

@JsonSerializable()
class ReauthDto {
  const ReauthDto({
    required this.method,
    this.identifier,
    this.code,
    this.password,
  });

  factory ReauthDto.fromJson(Map<String, Object?> json) =>
      _$ReauthDtoFromJson(json);

  final ReauthDtoMethod method;

  /// Required for `otp`: the verified phone / e-mail the code went to.
  final String? identifier;

  /// Required for `otp`: the 6-digit code.
  final String? code;

  /// Required for `password`: the account password.
  final String? password;

  Map<String, Object?> toJson() => _$ReauthDtoToJson(this);
}
