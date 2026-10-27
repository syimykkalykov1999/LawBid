// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_reveal_result_dto.dart';

part 'staff_reveal_result_envelope.g.dart';

@JsonSerializable()
class StaffRevealResultEnvelope {
  const StaffRevealResultEnvelope({required this.data, this.meta});

  factory StaffRevealResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffRevealResultEnvelopeFromJson(json);

  final StaffRevealResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffRevealResultEnvelopeToJson(this);
}
