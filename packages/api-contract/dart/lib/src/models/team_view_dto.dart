// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'team_tile_dto.dart';

part 'team_view_dto.g.dart';

@JsonSerializable()
class TeamViewDto {
  const TeamViewDto({required this.tiles});

  factory TeamViewDto.fromJson(Map<String, Object?> json) =>
      _$TeamViewDtoFromJson(json);

  final List<TeamTileDto> tiles;

  Map<String, Object?> toJson() => _$TeamViewDtoToJson(this);
}
