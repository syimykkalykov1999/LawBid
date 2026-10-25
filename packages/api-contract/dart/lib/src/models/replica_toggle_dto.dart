// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'replica_toggle_dto.g.dart';

@JsonSerializable()
class ReplicaToggleDto {
  const ReplicaToggleDto({required this.enabled});

  factory ReplicaToggleDto.fromJson(Map<String, Object?> json) =>
      _$ReplicaToggleDtoFromJson(json);

  final bool enabled;

  Map<String, Object?> toJson() => _$ReplicaToggleDtoToJson(this);
}
