// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bid_join_dto.dart';
import 'response_meta_dto.dart';

part 'bid_join_envelope.g.dart';

@JsonSerializable()
class BidJoinEnvelope {
  const BidJoinEnvelope({required this.data, this.meta});

  factory BidJoinEnvelope.fromJson(Map<String, Object?> json) =>
      _$BidJoinEnvelopeFromJson(json);

  final BidJoinDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BidJoinEnvelopeToJson(this);
}
