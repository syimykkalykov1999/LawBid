// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'seat_limit_request_dto.dart';

part 'seat_limit_request_envelope.g.dart';

@JsonSerializable()
class SeatLimitRequestEnvelope {
  const SeatLimitRequestEnvelope({required this.data, this.meta});

  factory SeatLimitRequestEnvelope.fromJson(Map<String, Object?> json) =>
      _$SeatLimitRequestEnvelopeFromJson(json);

  final SeatLimitRequestDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SeatLimitRequestEnvelopeToJson(this);
}
