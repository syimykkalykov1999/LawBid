// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'lease_queue_kind.dart';

part 'lease_dto.g.dart';

@JsonSerializable()
class LeaseDto {
  const LeaseDto({
    required this.kind,
    required this.itemId,
    required this.takenAt,
    required this.leasedUntil,
    required this.attempt,
    this.targetType,
  });

  factory LeaseDto.fromJson(Map<String, Object?> json) =>
      _$LeaseDtoFromJson(json);

  final LeaseQueueKind kind;
  final String itemId;
  final DateTime takenAt;

  /// The lease ends here unless renewed.
  final DateTime leasedUntil;

  /// How many times this item was taken (1 = first time).
  final num attempt;

  /// For a report: the kind of the reported object (post · comment · message · …), so the desk can open its card.
  final String? targetType;

  Map<String, Object?> toJson() => _$LeaseDtoToJson(this);
}
