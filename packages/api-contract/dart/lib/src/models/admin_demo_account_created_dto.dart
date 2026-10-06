// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_demo_account_dto.dart';

part 'admin_demo_account_created_dto.g.dart';

@JsonSerializable()
class AdminDemoAccountCreatedDto {
  const AdminDemoAccountCreatedDto({
    required this.account,
    required this.inviteCode,
  });

  factory AdminDemoAccountCreatedDto.fromJson(Map<String, Object?> json) =>
      _$AdminDemoAccountCreatedDtoFromJson(json);

  final AdminDemoAccountDto account;

  /// Shown once; only its hash is stored.
  final String? inviteCode;

  Map<String, Object?> toJson() => _$AdminDemoAccountCreatedDtoToJson(this);
}
