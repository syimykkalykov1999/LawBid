// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_passkey_login_dto.g.dart';

@JsonSerializable()
class AdminPasskeyLoginDto {
  const AdminPasskeyLoginDto({
    required this.ticket,
    required this.challengeId,
    required this.response,
  });

  factory AdminPasskeyLoginDto.fromJson(Map<String, Object?> json) =>
      _$AdminPasskeyLoginDtoFromJson(json);

  /// Ticket from login/password (5 minutes).
  final String ticket;

  /// challengeId from /login/passkey/options.
  final String challengeId;

  /// AuthenticationResponseJSON from the authenticator.
  final dynamic response;

  Map<String, Object?> toJson() => _$AdminPasskeyLoginDtoToJson(this);
}
