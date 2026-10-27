// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_person_history_dto.dart';

part 'staff_person_history_envelope.g.dart';

@JsonSerializable()
class StaffPersonHistoryEnvelope {
  const StaffPersonHistoryEnvelope({required this.data, this.meta});

  factory StaffPersonHistoryEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffPersonHistoryEnvelopeFromJson(json);

  final StaffPersonHistoryDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffPersonHistoryEnvelopeToJson(this);
}
