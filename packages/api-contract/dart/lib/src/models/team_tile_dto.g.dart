// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'team_tile_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TeamTileDto _$TeamTileDtoFromJson(Map<String, dynamic> json) => TeamTileDto(
  adminId: json['adminId'] as String,
  name: json['name'] as String?,
  role: json['role'] as String,
  status: DeskPresence.fromJson(json['status'] as String),
  items: (json['items'] as List<dynamic>)
      .map((e) => TeamTileItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  doneToday: json['doneToday'] as num,
);

Map<String, dynamic> _$TeamTileDtoToJson(TeamTileDto instance) =>
    <String, dynamic>{
      'adminId': instance.adminId,
      'name': ?instance.name,
      'role': instance.role,
      'status': instance.status.toJson(),
      'items': instance.items.map((e) => e.toJson()).toList(),
      'doneToday': instance.doneToday,
    };
