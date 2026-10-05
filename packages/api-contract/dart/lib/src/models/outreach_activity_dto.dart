// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_activity_kind.dart';

part 'outreach_activity_dto.g.dart';

@JsonSerializable()
class OutreachActivityDto {
  const OutreachActivityDto({
    required this.id,
    required this.kind,
    required this.outcome,
    required this.body,
    required this.partnerId,
    required this.actorAdminId,
    required this.actorName,
    required this.createdAt,
  });

  factory OutreachActivityDto.fromJson(Map<String, Object?> json) =>
      _$OutreachActivityDtoFromJson(json);

  final String id;
  final OutreachActivityKind kind;
  final String? outcome;
  final String? body;
  final String? partnerId;
  final String? actorAdminId;
  final String? actorName;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$OutreachActivityDtoToJson(this);
}
