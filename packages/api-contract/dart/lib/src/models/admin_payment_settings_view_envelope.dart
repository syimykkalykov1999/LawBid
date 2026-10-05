// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_payment_settings_view_dto.dart';
import 'response_meta_dto.dart';

part 'admin_payment_settings_view_envelope.g.dart';

@JsonSerializable()
class AdminPaymentSettingsViewEnvelope {
  const AdminPaymentSettingsViewEnvelope({required this.data, this.meta});

  factory AdminPaymentSettingsViewEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AdminPaymentSettingsViewEnvelopeFromJson(json);

  final AdminPaymentSettingsViewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminPaymentSettingsViewEnvelopeToJson(this);
}
