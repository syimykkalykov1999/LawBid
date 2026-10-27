// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_shortlist_dto.dart';

part 'staff_shortlist_envelope.g.dart';

@JsonSerializable()
class StaffShortlistEnvelope {
  const StaffShortlistEnvelope({required this.data, this.meta});

  factory StaffShortlistEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffShortlistEnvelopeFromJson(json);

  final StaffShortlistDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffShortlistEnvelopeToJson(this);
}
