// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_totp_setup_result_dto.dart';
import 'response_meta_dto.dart';

part 'admin_totp_setup_result_envelope.g.dart';

@JsonSerializable()
class AdminTotpSetupResultEnvelope {
  const AdminTotpSetupResultEnvelope({required this.data, this.meta});

  factory AdminTotpSetupResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminTotpSetupResultEnvelopeFromJson(json);

  final AdminTotpSetupResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminTotpSetupResultEnvelopeToJson(this);
}
