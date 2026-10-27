// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'no_show_dto_absent_side.dart';
import 'no_show_dto_source.dart';
import 'no_show_dto_state.dart';

part 'no_show_dto.g.dart';

@JsonSerializable()
class NoShowDto {
  const NoShowDto({
    required this.id,
    required this.absentSide,
    required this.state,
    required this.source,
    required this.markedAt,
    required this.disputeUntil,
    required this.viewerIsAbsent,
    required this.canDispute,
    required this.canWithdraw,
    this.disputeReason,
  });

  factory NoShowDto.fromJson(Map<String, Object?> json) =>
      _$NoShowDtoFromJson(json);

  final String id;

  /// Who did not come.
  final NoShowDtoAbsentSide absentSide;

  /// open: the marked person may dispute until disputeUntil; disputed: waits for staff; confirmed: final, counts for reliability; unconfirmed: the system suggested it and nobody confirmed; withdrawn / overturned: does not count.
  final NoShowDtoState state;
  final NoShowDtoSource source;
  final String markedAt;
  final String disputeUntil;
  final String? disputeReason;

  /// The viewer is the person marked absent.
  final bool viewerIsAbsent;
  final bool canDispute;
  final bool canWithdraw;

  Map<String, Object?> toJson() => _$NoShowDtoToJson(this);
}
