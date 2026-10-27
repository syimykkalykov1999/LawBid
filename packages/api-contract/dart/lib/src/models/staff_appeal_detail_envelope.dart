// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_appeal_detail_dto.dart';

part 'staff_appeal_detail_envelope.g.dart';

@JsonSerializable()
class StaffAppealDetailEnvelope {
  const StaffAppealDetailEnvelope({required this.data, this.meta});

  factory StaffAppealDetailEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffAppealDetailEnvelopeFromJson(json);

  final StaffAppealDetailDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffAppealDetailEnvelopeToJson(this);
}
