// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'seat_change_result_dto.dart';

part 'seat_change_result_envelope.g.dart';

@JsonSerializable()
class SeatChangeResultEnvelope {
  const SeatChangeResultEnvelope({
    required this.data,
    this.meta,
  });
  
  factory SeatChangeResultEnvelope.fromJson(Map<String, Object?> json) => _$SeatChangeResultEnvelopeFromJson(json);
  
  final SeatChangeResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SeatChangeResultEnvelopeToJson(this);
}
