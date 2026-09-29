// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_recovery_dto.g.dart';

@JsonSerializable()
class AdminRecoveryDto {
  const AdminRecoveryDto({required this.ticket, required this.recoveryCode});

  factory AdminRecoveryDto.fromJson(Map<String, Object?> json) =>
      _$AdminRecoveryDtoFromJson(json);

  /// Ticket from login/verify (5 minutes).
  final String ticket;

  /// One of the recovery codes (XXXXX-XXXXX).
  final String recoveryCode;

  Map<String, Object?> toJson() => _$AdminRecoveryDtoToJson(this);
}
