// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'refund_dto.dart';
import 'response_meta_dto.dart';

part 'refund_envelope.g.dart';

@JsonSerializable()
class RefundEnvelope {
  const RefundEnvelope({required this.data, this.meta});

  factory RefundEnvelope.fromJson(Map<String, Object?> json) =>
      _$RefundEnvelopeFromJson(json);

  final RefundDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$RefundEnvelopeToJson(this);
}
