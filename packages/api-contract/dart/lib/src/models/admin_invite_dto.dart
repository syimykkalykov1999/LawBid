// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_invite_dto.g.dart';

@JsonSerializable()
class AdminInviteDto {
  const AdminInviteDto({
    required this.token,
    required this.url,
    required this.expiresAt,
  });

  factory AdminInviteDto.fromJson(Map<String, Object?> json) =>
      _$AdminInviteDtoFromJson(json);

  /// Secret part of the link; shown once.
  final String token;

  /// Full link when ADMIN_PANEL_URL is set; otherwise null and the panel builds /invite/<token> itself.
  final String? url;
  final DateTime expiresAt;

  Map<String, Object?> toJson() => _$AdminInviteDtoToJson(this);
}
