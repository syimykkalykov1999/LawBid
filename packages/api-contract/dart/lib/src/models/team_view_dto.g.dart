// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'team_view_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TeamViewDto _$TeamViewDtoFromJson(Map<String, dynamic> json) => TeamViewDto(
  tiles: (json['tiles'] as List<dynamic>)
      .map((e) => TeamTileDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$TeamViewDtoToJson(TeamViewDto instance) =>
    <String, dynamic>{'tiles': instance.tiles.map((e) => e.toJson()).toList()};
