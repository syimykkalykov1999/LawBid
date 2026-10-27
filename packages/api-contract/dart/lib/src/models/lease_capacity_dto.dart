// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'lease_capacity_dto.g.dart';

@JsonSerializable()
class LeaseCapacityDto {
  const LeaseCapacityDto({required this.chat, required this.other});

  factory LeaseCapacityDto.fromJson(Map<String, Object?> json) =>
      _$LeaseCapacityDtoFromJson(json);

  /// Support dialogs held at once.
  final num chat;

  /// Items of any other queue held at once.
  final num other;

  Map<String, Object?> toJson() => _$LeaseCapacityDtoToJson(this);
}
