// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_person_detail_dto.dart';

part 'staff_person_detail_envelope.g.dart';

@JsonSerializable()
class StaffPersonDetailEnvelope {
  const StaffPersonDetailEnvelope({required this.data, this.meta});

  factory StaffPersonDetailEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffPersonDetailEnvelopeFromJson(json);

  final StaffPersonDetailDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffPersonDetailEnvelopeToJson(this);
}
