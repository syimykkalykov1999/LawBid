// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'passkey_register_dto.g.dart';

@JsonSerializable()
class PasskeyRegisterDto {
  const PasskeyRegisterDto({
    required this.response,
    this.name,
  });
  
  factory PasskeyRegisterDto.fromJson(Map<String, Object?> json) => _$PasskeyRegisterDtoFromJson(json);
  
  /// RegistrationResponseJSON from the authenticator.
  final dynamic response;

  /// Label for the list («iPhone», «YubiKey»).
  final String? name;

  Map<String, Object?> toJson() => _$PasskeyRegisterDtoToJson(this);
}
