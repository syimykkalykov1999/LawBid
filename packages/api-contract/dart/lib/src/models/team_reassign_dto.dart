// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'lease_queue_kind.dart';

part 'team_reassign_dto.g.dart';

@JsonSerializable()
class TeamReassignDto {
  const TeamReassignDto({
    required this.kind,
    required this.itemId,
    required this.toAdminId,
    this.reason,
  });

  factory TeamReassignDto.fromJson(Map<String, Object?> json) =>
      _$TeamReassignDtoFromJson(json);

  final LeaseQueueKind kind;
  final String itemId;
  final String toAdminId;
  final String? reason;

  Map<String, Object?> toJson() => _$TeamReassignDtoToJson(this);
}
