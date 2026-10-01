// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'activity_dto.g.dart';

@JsonSerializable()
class ActivityDto {
  const ActivityDto({
    required this.id,
    required this.membershipId,
    required this.assistantName,
    required this.action,
    required this.createdAt,
    this.targetType,
    this.targetId,
    this.summary,
  });

  factory ActivityDto.fromJson(Map<String, Object?> json) =>
      _$ActivityDtoFromJson(json);

  final String id;
  final String membershipId;
  final String assistantName;
  final String action;
  final String? targetType;
  final String? targetId;
  final String? summary;
  final String createdAt;

  Map<String, Object?> toJson() => _$ActivityDtoToJson(this);
}
