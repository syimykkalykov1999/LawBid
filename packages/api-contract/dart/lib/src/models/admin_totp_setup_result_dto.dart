// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_session_dto.dart';

part 'admin_totp_setup_result_dto.g.dart';

@JsonSerializable()
class AdminTotpSetupResultDto {
  const AdminTotpSetupResultDto({
    required this.recoveryCodes,
    required this.session,
  });

  factory AdminTotpSetupResultDto.fromJson(Map<String, Object?> json) =>
      _$AdminTotpSetupResultDtoFromJson(json);

  /// Ten one-time recovery codes, shown once.
  final List<String> recoveryCodes;
  final AdminSessionDto session;

  Map<String, Object?> toJson() => _$AdminTotpSetupResultDtoToJson(this);
}
