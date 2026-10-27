// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_rate_dto.dart';

part 'staff_rate_list_envelope.g.dart';

@JsonSerializable()
class StaffRateListEnvelope {
  const StaffRateListEnvelope({required this.data, this.meta});

  factory StaffRateListEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffRateListEnvelopeFromJson(json);

  final List<StaffRateDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffRateListEnvelopeToJson(this);
}
