// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_invite_accept_result_dto.g.dart';

@JsonSerializable()
class AdminInviteAcceptResultDto {
  const AdminInviteAcceptResultDto({required this.login});

  factory AdminInviteAcceptResultDto.fromJson(Map<String, Object?> json) =>
      _$AdminInviteAcceptResultDtoFromJson(json);

  /// The login to sign in with.
  final String login;

  Map<String, Object?> toJson() => _$AdminInviteAcceptResultDtoToJson(this);
}
