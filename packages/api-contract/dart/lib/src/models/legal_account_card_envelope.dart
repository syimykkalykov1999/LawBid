// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_account_card_dto.dart';
import 'response_meta_dto.dart';

part 'legal_account_card_envelope.g.dart';

@JsonSerializable()
class LegalAccountCardEnvelope {
  const LegalAccountCardEnvelope({required this.data, this.meta});

  factory LegalAccountCardEnvelope.fromJson(Map<String, Object?> json) =>
      _$LegalAccountCardEnvelopeFromJson(json);

  final LegalAccountCardDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$LegalAccountCardEnvelopeToJson(this);
}
