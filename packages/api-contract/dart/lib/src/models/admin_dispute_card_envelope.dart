// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_dispute_card_dto.dart';
import 'response_meta_dto.dart';

part 'admin_dispute_card_envelope.g.dart';

@JsonSerializable()
class AdminDisputeCardEnvelope {
  const AdminDisputeCardEnvelope({required this.data, this.meta});

  factory AdminDisputeCardEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminDisputeCardEnvelopeFromJson(json);

  final AdminDisputeCardDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminDisputeCardEnvelopeToJson(this);
}
