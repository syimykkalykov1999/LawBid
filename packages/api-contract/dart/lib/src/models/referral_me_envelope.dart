// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'referral_me_dto.dart';
import 'response_meta_dto.dart';

part 'referral_me_envelope.g.dart';

@JsonSerializable()
class ReferralMeEnvelope {
  const ReferralMeEnvelope({required this.data, this.meta});

  factory ReferralMeEnvelope.fromJson(Map<String, Object?> json) =>
      _$ReferralMeEnvelopeFromJson(json);

  final ReferralMeDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ReferralMeEnvelopeToJson(this);
}
