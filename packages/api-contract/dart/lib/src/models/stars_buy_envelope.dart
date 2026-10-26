// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'stars_buy_dto.dart';

part 'stars_buy_envelope.g.dart';

@JsonSerializable()
class StarsBuyEnvelope {
  const StarsBuyEnvelope({required this.data, this.meta});

  factory StarsBuyEnvelope.fromJson(Map<String, Object?> json) =>
      _$StarsBuyEnvelopeFromJson(json);

  final StarsBuyDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StarsBuyEnvelopeToJson(this);
}
