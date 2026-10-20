// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_member_dto.dart';

part 'admin_group_detail_dto.g.dart';

@JsonSerializable()
class AdminGroupDetailDto {
  const AdminGroupDetailDto({
    required this.id,
    required this.title,
    required this.memberCount,
    required this.createdBy,
    required this.messageCount,
    required this.pollCount,
    required this.createdAt,
    required this.members,
    this.description,
    this.ownerName,
    this.lastMessageAt,
    this.deletedAt,
  });

  factory AdminGroupDetailDto.fromJson(Map<String, Object?> json) =>
      _$AdminGroupDetailDtoFromJson(json);

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
  final List<GroupMemberDto> members;

  Map<String, Object?> toJson() => _$AdminGroupDetailDtoToJson(this);
}
