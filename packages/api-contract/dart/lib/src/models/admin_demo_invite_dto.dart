// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_demo_invite_dto.g.dart';

@JsonSerializable()
class AdminDemoInviteDto {
  const AdminDemoInviteDto({
    required this.inviteCode,
    required this.inviteExpiresAt,
  });

  factory AdminDemoInviteDto.fromJson(Map<String, Object?> json) =>
      _$AdminDemoInviteDtoFromJson(json);

  /// Shown once; only its hash is stored.
  final String inviteCode;
  final DateTime inviteExpiresAt;

  Map<String, Object?> toJson() => _$AdminDemoInviteDtoToJson(this);
}
