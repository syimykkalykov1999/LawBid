// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'seat_limit_state_dto.dart';

part 'seat_limit_state_envelope.g.dart';

@JsonSerializable()
class SeatLimitStateEnvelope {
  const SeatLimitStateEnvelope({required this.data, this.meta});

  factory SeatLimitStateEnvelope.fromJson(Map<String, Object?> json) =>
      _$SeatLimitStateEnvelopeFromJson(json);

  final SeatLimitStateDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SeatLimitStateEnvelopeToJson(this);
}
