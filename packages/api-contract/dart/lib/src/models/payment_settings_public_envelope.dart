// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_settings_public_dto.dart';
import 'response_meta_dto.dart';

part 'payment_settings_public_envelope.g.dart';

@JsonSerializable()
class PaymentSettingsPublicEnvelope {
  const PaymentSettingsPublicEnvelope({required this.data, this.meta});

  factory PaymentSettingsPublicEnvelope.fromJson(Map<String, Object?> json) =>
      _$PaymentSettingsPublicEnvelopeFromJson(json);

  final PaymentSettingsPublicDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PaymentSettingsPublicEnvelopeToJson(this);
}
