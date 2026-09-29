// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'moderation_author_dto.g.dart';

@JsonSerializable()
class ModerationAuthorDto {
  const ModerationAuthorDto({
    required this.id,
    required this.role,
    required this.status,
    required this.firstName,
    required this.lastName,
    required this.username,
    required this.warnings,
    required this.suspensions,
  });

  factory ModerationAuthorDto.fromJson(Map<String, Object?> json) =>
      _$ModerationAuthorDtoFromJson(json);

  final String id;
  final String? role;
  final String status;
  final String? firstName;
  final String? lastName;
  final String? username;
  final int warnings;
  final int suspensions;

  Map<String, Object?> toJson() => _$ModerationAuthorDtoToJson(this);
}
