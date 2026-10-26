// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_account_dto.dart';
import 'admin_invite_dto.dart';

part 'admin_invite_result_dto.g.dart';

@JsonSerializable()
class AdminInviteResultDto {
  const AdminInviteResultDto({required this.admin, required this.invite});

  factory AdminInviteResultDto.fromJson(Map<String, Object?> json) =>
      _$AdminInviteResultDtoFromJson(json);

  final AdminAccountDto admin;
  final AdminInviteDto invite;

  Map<String, Object?> toJson() => _$AdminInviteResultDtoToJson(this);
}
