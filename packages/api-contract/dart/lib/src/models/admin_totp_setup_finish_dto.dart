// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_totp_setup_finish_dto.g.dart';

@JsonSerializable()
class AdminTotpSetupFinishDto {
  const AdminTotpSetupFinishDto({required this.ticket, required this.code});

  factory AdminTotpSetupFinishDto.fromJson(Map<String, Object?> json) =>
      _$AdminTotpSetupFinishDtoFromJson(json);

  /// Ticket from login/password (15 minutes).
  final String ticket;

  /// The 6-digit code the app shows now.
  final String code;

  Map<String, Object?> toJson() => _$AdminTotpSetupFinishDtoToJson(this);
}
