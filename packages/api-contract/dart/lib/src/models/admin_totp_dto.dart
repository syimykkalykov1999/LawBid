// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_totp_dto.g.dart';

@JsonSerializable()
class AdminTotpDto {
  const AdminTotpDto({required this.ticket, required this.code});

  factory AdminTotpDto.fromJson(Map<String, Object?> json) =>
      _$AdminTotpDtoFromJson(json);

  /// Ticket from login/verify (5 minutes).
  final String ticket;

  /// The 6-digit authenticator code.
  final String code;

  Map<String, Object?> toJson() => _$AdminTotpDtoToJson(this);
}
