// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'desk_presence.dart';
import 'team_tile_item_dto.dart';

part 'team_tile_dto.g.dart';

@JsonSerializable()
class TeamTileDto {
  const TeamTileDto({
    required this.adminId,
    required this.name,
    required this.role,
    required this.status,
    required this.items,
    required this.doneToday,
  });

  factory TeamTileDto.fromJson(Map<String, Object?> json) =>
      _$TeamTileDtoFromJson(json);

  final String adminId;
  final String? name;
  final String role;
  final DeskPresence status;

  /// In work by this person.
  final List<TeamTileItemDto> items;

  /// Items this person closed today.
  final num doneToday;

  Map<String, Object?> toJson() => _$TeamTileDtoToJson(this);
}
