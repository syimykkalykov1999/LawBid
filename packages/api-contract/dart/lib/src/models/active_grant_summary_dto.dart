// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'active_grant_summary_dto.g.dart';

@JsonSerializable()
class ActiveGrantSummaryDto {
  const ActiveGrantSummaryDto({
    required this.id,
    required this.endsAt,
    required this.assistantSeats,
  });

  factory ActiveGrantSummaryDto.fromJson(Map<String, Object?> json) =>
      _$ActiveGrantSummaryDtoFromJson(json);

  final String id;
  final DateTime endsAt;
  final int assistantSeats;

  Map<String, Object?> toJson() => _$ActiveGrantSummaryDtoToJson(this);
}
