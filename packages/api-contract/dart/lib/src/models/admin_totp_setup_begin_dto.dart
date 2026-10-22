// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_totp_setup_begin_dto.g.dart';

@JsonSerializable()
class AdminTotpSetupBeginDto {
  const AdminTotpSetupBeginDto({required this.ticket});

  factory AdminTotpSetupBeginDto.fromJson(Map<String, Object?> json) =>
      _$AdminTotpSetupBeginDtoFromJson(json);

  /// Ticket from login/password (15 minutes).
  final String ticket;

  Map<String, Object?> toJson() => _$AdminTotpSetupBeginDtoToJson(this);
}
