// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'client_badge_checkout_dto.dart';
import 'response_meta_dto.dart';

part 'client_badge_checkout_envelope.g.dart';

@JsonSerializable()
class ClientBadgeCheckoutEnvelope {
  const ClientBadgeCheckoutEnvelope({required this.data, this.meta});

  factory ClientBadgeCheckoutEnvelope.fromJson(Map<String, Object?> json) =>
      _$ClientBadgeCheckoutEnvelopeFromJson(json);

  final ClientBadgeCheckoutDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ClientBadgeCheckoutEnvelopeToJson(this);
}
