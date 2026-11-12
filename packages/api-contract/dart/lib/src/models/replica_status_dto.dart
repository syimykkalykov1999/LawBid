// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'replica_status_dto_state.dart';

part 'replica_status_dto.g.dart';

@JsonSerializable()
class ReplicaStatusDto {
  const ReplicaStatusDto({
    required this.state,
    required this.lagSeconds,
    required this.instanceClass,
    required this.serving,
    required this.note,
    required this.copies,
  });

  factory ReplicaStatusDto.fromJson(Map<String, Object?> json) =>
      _$ReplicaStatusDtoFromJson(json);

  final ReplicaStatusDtoState state;

  /// Seconds behind the primary.
  final num? lagSeconds;
  final String? instanceClass;

  /// This process sends reads to the copy now.
  final bool serving;

  /// Plain-words explanation for the card.
  final String note;

  /// Read copies the app knows: the button copy (0/1) or the copies the infra pipeline made (DB_REPLICA_HOST, state «managed»).
  final int copies;

  Map<String, Object?> toJson() => _$ReplicaStatusDtoToJson(this);
}
