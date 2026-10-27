// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'team_tile_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TeamTileItemDto _$TeamTileItemDtoFromJson(Map<String, dynamic> json) =>
    TeamTileItemDto(
      kind: LeaseQueueKind.fromJson(json['kind'] as String),
      itemId: json['itemId'] as String,
      takenAt: json['takenAt'] == null
          ? null
          : DateTime.parse(json['takenAt'] as String),
      leasedUntil: json['leasedUntil'] == null
          ? null
          : DateTime.parse(json['leasedUntil'] as String),
      heldMinutes: json['heldMinutes'] as num,
    );

Map<String, dynamic> _$TeamTileItemDtoToJson(TeamTileItemDto instance) =>
    <String, dynamic>{
      'kind': instance.kind.toJson(),
      'itemId': instance.itemId,
      'takenAt': ?instance.takenAt?.toIso8601String(),
      'leasedUntil': ?instance.leasedUntil?.toIso8601String(),
      'heldMinutes': instance.heldMinutes,
    };
