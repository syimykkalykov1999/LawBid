// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fraud_card_dto.dart';
import 'response_meta_dto.dart';

part 'fraud_card_envelope.g.dart';

@JsonSerializable()
class FraudCardEnvelope {
  const FraudCardEnvelope({required this.data, this.meta});

  factory FraudCardEnvelope.fromJson(Map<String, Object?> json) =>
      _$FraudCardEnvelopeFromJson(json);

  final FraudCardDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$FraudCardEnvelopeToJson(this);
}
