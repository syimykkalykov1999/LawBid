// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'lease_queue_kind.dart';

part 'team_release_dto.g.dart';

@JsonSerializable()
class TeamReleaseDto {
  const TeamReleaseDto({this.kind, this.itemId, this.reason});

  factory TeamReleaseDto.fromJson(Map<String, Object?> json) =>
      _$TeamReleaseDtoFromJson(json);

  /// Omit kind+itemId to take everything away from this person.
  final LeaseQueueKind? kind;
  final String? itemId;
  final String? reason;

  Map<String, Object?> toJson() => _$TeamReleaseDtoToJson(this);
}
