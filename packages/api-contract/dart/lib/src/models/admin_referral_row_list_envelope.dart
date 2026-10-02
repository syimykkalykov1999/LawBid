// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_referral_row_dto.dart';
import 'response_meta_dto.dart';

part 'admin_referral_row_list_envelope.g.dart';

@JsonSerializable()
class AdminReferralRowListEnvelope {
  const AdminReferralRowListEnvelope({required this.data, this.meta});

  factory AdminReferralRowListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminReferralRowListEnvelopeFromJson(json);

  final List<AdminReferralRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminReferralRowListEnvelopeToJson(this);
}
