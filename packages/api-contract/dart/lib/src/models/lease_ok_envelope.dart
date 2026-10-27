// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'lease_ok_dto.dart';
import 'response_meta_dto.dart';

part 'lease_ok_envelope.g.dart';

@JsonSerializable()
class LeaseOkEnvelope {
  const LeaseOkEnvelope({required this.data, this.meta});

  factory LeaseOkEnvelope.fromJson(Map<String, Object?> json) =>
      _$LeaseOkEnvelopeFromJson(json);

  final LeaseOkDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$LeaseOkEnvelopeToJson(this);
}
