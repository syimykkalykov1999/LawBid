// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'lease_queue_kind.dart';

part 'team_tile_item_dto.g.dart';

@JsonSerializable()
class TeamTileItemDto {
  const TeamTileItemDto({
    required this.kind,
    required this.itemId,
    required this.takenAt,
    required this.leasedUntil,
    required this.heldMinutes,
  });

  factory TeamTileItemDto.fromJson(Map<String, Object?> json) =>
      _$TeamTileItemDtoFromJson(json);

  final LeaseQueueKind kind;
  final String itemId;
  final DateTime? takenAt;
  final DateTime? leasedUntil;

  /// Minutes in this person’s hands.
  final num heldMinutes;

  Map<String, Object?> toJson() => _$TeamTileItemDtoToJson(this);
}
