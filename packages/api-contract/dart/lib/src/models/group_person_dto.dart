// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_person_dto_kind.dart';

part 'group_person_dto.g.dart';

@JsonSerializable()
class GroupPersonDto {
  const GroupPersonDto({
    required this.userId,
    required this.kind,
    required this.verifiedBadge,
    this.displayName,
    this.username,
    this.avatarUrl,
  });

  factory GroupPersonDto.fromJson(Map<String, Object?> json) =>
      _$GroupPersonDtoFromJson(json);

  final String userId;
  final String? displayName;
  final String? username;
  final String? avatarUrl;
  final GroupPersonDtoKind kind;
  final bool verifiedBadge;

  Map<String, Object?> toJson() => _$GroupPersonDtoToJson(this);
}
