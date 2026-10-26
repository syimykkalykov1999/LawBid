// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payout_account_dto.dart';
import 'response_meta_dto.dart';

part 'payout_account_envelope.g.dart';

@JsonSerializable()
class PayoutAccountEnvelope {
  const PayoutAccountEnvelope({required this.data, this.meta});

  factory PayoutAccountEnvelope.fromJson(Map<String, Object?> json) =>
      _$PayoutAccountEnvelopeFromJson(json);

  final PayoutAccountDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PayoutAccountEnvelopeToJson(this);
}
