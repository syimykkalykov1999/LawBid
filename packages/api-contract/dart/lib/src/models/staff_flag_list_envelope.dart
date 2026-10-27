// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_flag_list_dto.dart';

part 'staff_flag_list_envelope.g.dart';

@JsonSerializable()
class StaffFlagListEnvelope {
  const StaffFlagListEnvelope({required this.data, this.meta});

  factory StaffFlagListEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffFlagListEnvelopeFromJson(json);

  final StaffFlagListDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffFlagListEnvelopeToJson(this);
}
