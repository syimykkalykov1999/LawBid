// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_signal_list_dto.dart';

part 'staff_signal_list_envelope.g.dart';

@JsonSerializable()
class StaffSignalListEnvelope {
  const StaffSignalListEnvelope({required this.data, this.meta});

  factory StaffSignalListEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffSignalListEnvelopeFromJson(json);

  final StaffSignalListDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffSignalListEnvelopeToJson(this);
}
