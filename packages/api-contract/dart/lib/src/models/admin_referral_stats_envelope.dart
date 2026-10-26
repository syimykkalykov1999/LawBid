// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_referral_stats_dto.dart';
import 'response_meta_dto.dart';

part 'admin_referral_stats_envelope.g.dart';

@JsonSerializable()
class AdminReferralStatsEnvelope {
  const AdminReferralStatsEnvelope({required this.data, this.meta});

  factory AdminReferralStatsEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminReferralStatsEnvelopeFromJson(json);

  final AdminReferralStatsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminReferralStatsEnvelopeToJson(this);
}
