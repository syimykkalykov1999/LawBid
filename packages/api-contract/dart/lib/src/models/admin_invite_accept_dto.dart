// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_invite_accept_dto.g.dart';

@JsonSerializable()
class AdminInviteAcceptDto {
  const AdminInviteAcceptDto({
    required this.token,
    required this.login,
    required this.password,
  });

  factory AdminInviteAcceptDto.fromJson(Map<String, Object?> json) =>
      _$AdminInviteAcceptDtoFromJson(json);

  final String token;
  final String login;
  final String password;

  Map<String, Object?> toJson() => _$AdminInviteAcceptDtoToJson(this);
}
