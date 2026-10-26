// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_trust_card_dto.dart';
import 'response_meta_dto.dart';

part 'admin_trust_card_envelope.g.dart';

@JsonSerializable()
class AdminTrustCardEnvelope {
  const AdminTrustCardEnvelope({required this.data, this.meta});

  factory AdminTrustCardEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminTrustCardEnvelopeFromJson(json);

  final AdminTrustCardDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminTrustCardEnvelopeToJson(this);
}
