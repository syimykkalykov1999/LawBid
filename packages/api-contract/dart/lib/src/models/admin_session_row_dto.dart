// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_session_row_dto_role.dart';

part 'admin_session_row_dto.g.dart';

@JsonSerializable()
class AdminSessionRowDto {
  const AdminSessionRowDto({
    required this.sessionId,
    required this.adminId,
    required this.email,
    required this.login,
    required this.role,
    required this.ip,
    required this.device,
    required this.createdAt,
    required this.lastSeenAt,
    required this.lastAction,
    required this.current,
  });

  factory AdminSessionRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminSessionRowDtoFromJson(json);

  final String sessionId;
  final String adminId;
  final String email;
  final String? login;
  final AdminSessionRowDtoRole role;
  final String? ip;
  final String? device;
  final DateTime createdAt;
  final DateTime lastSeenAt;
  final String? lastAction;

  /// This is the session asking.
  final bool current;

  Map<String, Object?> toJson() => _$AdminSessionRowDtoToJson(this);
}
