// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_my_appeal_dto.dart';

part 'staff_my_appeal_list_envelope.g.dart';

@JsonSerializable()
class StaffMyAppealListEnvelope {
  const StaffMyAppealListEnvelope({required this.data, this.meta});

  factory StaffMyAppealListEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffMyAppealListEnvelopeFromJson(json);

  final List<StaffMyAppealDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffMyAppealListEnvelopeToJson(this);
}
