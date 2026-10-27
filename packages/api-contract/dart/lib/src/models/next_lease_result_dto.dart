// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'lease_dto.dart';
import 'lease_next_status.dart';

part 'next_lease_result_dto.g.dart';

@JsonSerializable()
class NextLeaseResultDto {
  const NextLeaseResultDto({
    required this.status,
    this.lease,
    this.held,
    this.retryAfterSec,
  });

  factory NextLeaseResultDto.fromJson(Map<String, Object?> json) =>
      _$NextLeaseResultDtoFromJson(json);

  /// leased = a new item is yours; busy = your hands are full (see `held`); empty = nothing waits; wrap_up = wait `retryAfterSec`; away / offline = come back online first.
  final LeaseNextStatus status;
  final LeaseDto? lease;
  final List<LeaseDto>? held;
  final num? retryAfterSec;

  Map<String, Object?> toJson() => _$NextLeaseResultDtoToJson(this);
}
