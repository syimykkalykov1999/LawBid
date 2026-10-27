// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'lease_dto.dart';
import 'response_meta_dto.dart';

part 'lease_envelope.g.dart';

@JsonSerializable()
class LeaseEnvelope {
  const LeaseEnvelope({required this.data, this.meta});

  factory LeaseEnvelope.fromJson(Map<String, Object?> json) =>
      _$LeaseEnvelopeFromJson(json);

  final LeaseDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$LeaseEnvelopeToJson(this);
}
