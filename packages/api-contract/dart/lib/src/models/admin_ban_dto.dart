// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_ban_dto_kind.dart';

part 'admin_ban_dto.g.dart';

@JsonSerializable()
class AdminBanDto {
  const AdminBanDto({
    required this.id,
    required this.kind,
    required this.value,
    required this.reason,
    required this.createdAt,
    required this.createdBy,
    required this.active,
    this.userId,
    this.userName,
    this.expiresAt,
    this.liftedAt,
    this.liftReason,
  });

  factory AdminBanDto.fromJson(Map<String, Object?> json) =>
      _$AdminBanDtoFromJson(json);

  final String id;
  final AdminBanDtoKind kind;
  final String value;
  final String? userId;
  final String? userName;
  final String reason;
  final String? expiresAt;
  final String createdAt;
  final String createdBy;
  final String? liftedAt;
  final String? liftReason;

  /// Not lifted and not expired.
  final bool active;

  Map<String, Object?> toJson() => _$AdminBanDtoToJson(this);
}
