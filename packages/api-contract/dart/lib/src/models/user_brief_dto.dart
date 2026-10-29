// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'user_brief_dto_role.dart';

part 'user_brief_dto.g.dart';

@JsonSerializable()
class UserBriefDto {
  const UserBriefDto({
    required this.id,
    required this.role,
    required this.username,
    required this.verifiedBadge,
    this.firstName,
    this.lastName,
    this.avatarUrl,
  });
  
  factory UserBriefDto.fromJson(Map<String, Object?> json) => _$UserBriefDtoFromJson(json);
  
  final String id;
  final UserBriefDtoRole role;
  final String username;
  final String? firstName;
  final String? lastName;
  final String? avatarUrl;

  /// Attorney: verified licence; client: the paid gold check.
  final bool verifiedBadge;

  Map<String, Object?> toJson() => _$UserBriefDtoToJson(this);
}
