// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_referral_code_row_dto.dart';
import 'response_meta_dto.dart';

part 'admin_referral_code_row_list_envelope.g.dart';

@JsonSerializable()
class AdminReferralCodeRowListEnvelope {
  const AdminReferralCodeRowListEnvelope({required this.data, this.meta});

  factory AdminReferralCodeRowListEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AdminReferralCodeRowListEnvelopeFromJson(json);

  final List<AdminReferralCodeRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminReferralCodeRowListEnvelopeToJson(this);
}
