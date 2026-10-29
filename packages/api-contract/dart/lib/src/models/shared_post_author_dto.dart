// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'shared_post_author_dto_role.dart';

part 'shared_post_author_dto.g.dart';

@JsonSerializable()
class SharedPostAuthorDto {
  const SharedPostAuthorDto({
    required this.id,
    required this.role,
    required this.username,
    required this.verifiedBadge,
    this.firstName,
    this.lastName,
    this.avatarUrl,
  });
  
  factory SharedPostAuthorDto.fromJson(Map<String, Object?> json) => _$SharedPostAuthorDtoFromJson(json);
  
  final String id;
  final SharedPostAuthorDtoRole role;
  final String username;
  final String? firstName;
  final String? lastName;
  final String? avatarUrl;
  final bool verifiedBadge;

  Map<String, Object?> toJson() => _$SharedPostAuthorDtoToJson(this);
}
