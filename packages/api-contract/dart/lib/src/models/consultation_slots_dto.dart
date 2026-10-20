// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'consultation_slots_dto.g.dart';

@JsonSerializable()
class ConsultationSlotsDto {
  const ConsultationSlotsDto({
    required this.attorneyId,
    required this.timezone,
    required this.slotMinutes,
    required this.autoConfirm,
    required this.from,
    required this.days,
    required this.slots,
    required this.localSlots,
    required this.lastDate,
  });

  factory ConsultationSlotsDto.fromJson(Map<String, Object?> json) =>
      _$ConsultationSlotsDtoFromJson(json);

  final String attorneyId;
  final String timezone;
  final int slotMinutes;
  final bool autoConfirm;
  final String from;
  final int days;

  /// Start instants (UTC ISO), sorted.
  final List<String> slots;

  /// The same starts as wall clock in the attorney time zone (YYYY-MM-DDTHH:mm), one per slot.
  final List<String> localSlots;

  /// Last bookable day (attorney local date).
  final String lastDate;

  Map<String, Object?> toJson() => _$ConsultationSlotsDtoToJson(this);
}
