// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'seat_preview_dto.dart';

part 'seat_preview_envelope.g.dart';

@JsonSerializable()
class SeatPreviewEnvelope {
  const SeatPreviewEnvelope({
    required this.data,
    this.meta,
  });
  
  factory SeatPreviewEnvelope.fromJson(Map<String, Object?> json) => _$SeatPreviewEnvelopeFromJson(json);
  
  final SeatPreviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SeatPreviewEnvelopeToJson(this);
}
