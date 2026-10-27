// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_my_progress_dto.dart';

part 'staff_my_progress_envelope.g.dart';

@JsonSerializable()
class StaffMyProgressEnvelope {
  const StaffMyProgressEnvelope({required this.data, this.meta});

  factory StaffMyProgressEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffMyProgressEnvelopeFromJson(json);

  final StaffMyProgressDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffMyProgressEnvelopeToJson(this);
}
