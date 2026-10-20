// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_group_dto.g.dart';

@JsonSerializable()
class AdminGroupDto {
  const AdminGroupDto({
    required this.id,
    required this.title,
    required this.memberCount,
    required this.createdBy,
    required this.messageCount,
    required this.pollCount,
    required this.createdAt,
    this.description,
    this.ownerName,
    this.lastMessageAt,
    this.deletedAt,
  });

  factory AdminGroupDto.fromJson(Map<String, Object?> json) =>
      _$AdminGroupDtoFromJson(json);

  final String id;
  final String title;
  final String? description;
  final num memberCount;
  final String? ownerName;
  final String createdBy;
  final num messageCount;
  final num pollCount;
  final DateTime createdAt;
  final DateTime? lastMessageAt;
  final DateTime? deletedAt;

  Map<String, Object?> toJson() => _$AdminGroupDtoToJson(this);
}
