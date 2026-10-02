// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'apply_referral_result_dto.dart';
import 'response_meta_dto.dart';

part 'apply_referral_result_envelope.g.dart';

@JsonSerializable()
class ApplyReferralResultEnvelope {
  const ApplyReferralResultEnvelope({required this.data, this.meta});

  factory ApplyReferralResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$ApplyReferralResultEnvelopeFromJson(json);

  final ApplyReferralResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ApplyReferralResultEnvelopeToJson(this);
}
