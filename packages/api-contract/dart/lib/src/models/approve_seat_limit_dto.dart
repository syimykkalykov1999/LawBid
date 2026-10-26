// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'approve_seat_limit_dto.g.dart';

@JsonSerializable()
class ApproveSeatLimitDto {
  const ApproveSeatLimitDto({required this.seats, this.note});

  factory ApproveSeatLimitDto.fromJson(Map<String, Object?> json) =>
      _$ApproveSeatLimitDtoFromJson(json);

  /// The attorney's new limit.
  final int seats;
  final String? note;

  Map<String, Object?> toJson() => _$ApproveSeatLimitDtoToJson(this);
}
