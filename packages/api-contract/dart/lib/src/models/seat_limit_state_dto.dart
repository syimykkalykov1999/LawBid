// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'seat_limit_request_dto.dart';

part 'seat_limit_state_dto.g.dart';

@JsonSerializable()
class SeatLimitStateDto {
  const SeatLimitStateDto({
    required this.limit,
    required this.isPersonal,
    required this.request,
  });

  factory SeatLimitStateDto.fromJson(Map<String, Object?> json) =>
      _$SeatLimitStateDtoFromJson(json);

  /// The attorney's limit.
  final int limit;

  /// An admin set a personal limit.
  final bool isPersonal;
  final SeatLimitRequestDto? request;

  Map<String, Object?> toJson() => _$SeatLimitStateDtoToJson(this);
}
