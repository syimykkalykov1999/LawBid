// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'team_release_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TeamReleaseDto _$TeamReleaseDtoFromJson(Map<String, dynamic> json) =>
    TeamReleaseDto(
      kind: json['kind'] == null
          ? null
          : LeaseQueueKind.fromJson(json['kind'] as String),
      itemId: json['itemId'] as String?,
      reason: json['reason'] as String?,
    );

Map<String, dynamic> _$TeamReleaseDtoToJson(TeamReleaseDto instance) =>
    <String, dynamic>{
      'kind': ?instance.kind?.toJson(),
      'itemId': ?instance.itemId,
      'reason': ?instance.reason,
    };
