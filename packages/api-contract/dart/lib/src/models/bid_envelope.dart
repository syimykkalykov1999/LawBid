// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bid_dto.dart';
import 'response_meta_dto.dart';

part 'bid_envelope.g.dart';

@JsonSerializable()
class BidEnvelope {
  const BidEnvelope({required this.data, this.meta});

  factory BidEnvelope.fromJson(Map<String, Object?> json) =>
      _$BidEnvelopeFromJson(json);

  final BidDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BidEnvelopeToJson(this);
}
