// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_passkey_register_dto.g.dart';

@JsonSerializable()
class AdminPasskeyRegisterDto {
  const AdminPasskeyRegisterDto({required this.response, this.name});

  factory AdminPasskeyRegisterDto.fromJson(Map<String, Object?> json) =>
      _$AdminPasskeyRegisterDtoFromJson(json);

  /// RegistrationResponseJSON from the authenticator.
  final dynamic response;
  final String? name;

  Map<String, Object?> toJson() => _$AdminPasskeyRegisterDtoToJson(this);
}
