// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'person_role.dart';

part 'blocked_user_dto.g.dart';

@JsonSerializable()
class BlockedUserDto {
  const BlockedUserDto({
    required this.id,
    required this.role,
    required this.username,
    required this.firstName,
    required this.lastName,
    required this.avatarUrl,
    required this.blockedAt,
  });

  factory BlockedUserDto.fromJson(Map<String, Object?> json) =>
      _$BlockedUserDtoFromJson(json);

  final String id;
  final PersonRole role;
  final String? username;
  final String? firstName;
  final String? lastName;
  final String? avatarUrl;
  final String blockedAt;

  Map<String, Object?> toJson() => _$BlockedUserDtoToJson(this);
}
