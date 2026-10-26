// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'cost_row_status_dto_live.dart';
import 'cost_row_status_dto_state.dart';

part 'cost_row_status_dto.g.dart';

@JsonSerializable()
class CostRowStatusDto {
  const CostRowStatusDto({
    required this.state,
    required this.live,
    required this.reason,
    required this.checkedAt,
  });

  factory CostRowStatusDto.fromJson(Map<String, Object?> json) =>
      _$CostRowStatusDtoFromJson(json);

  final CostRowStatusDtoState state;

  /// green works now · grey off or waiting · yellow look at it
  final CostRowStatusDtoLive live;

  /// One Russian phrase for the hover text.
  final String reason;
  final String checkedAt;

  Map<String, Object?> toJson() => _$CostRowStatusDtoToJson(this);
}
