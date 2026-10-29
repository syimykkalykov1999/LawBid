// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'password_reset_request_dto.g.dart';

@JsonSerializable()
class PasswordResetRequestDto {
  const PasswordResetRequestDto({
    required this.identifier,
  });
  
  factory PasswordResetRequestDto.fromJson(Map<String, Object?> json) => _$PasswordResetRequestDtoFromJson(json);
  
  /// E.164 phone number or e-mail address.
  final String identifier;

  Map<String, Object?> toJson() => _$PasswordResetRequestDtoToJson(this);
}
