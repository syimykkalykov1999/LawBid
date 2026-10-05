// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'reward_award_dto.dart';

part 'reward_award_envelope.g.dart';

@JsonSerializable()
class RewardAwardEnvelope {
  const RewardAwardEnvelope({required this.data, this.meta});

  factory RewardAwardEnvelope.fromJson(Map<String, Object?> json) =>
      _$RewardAwardEnvelopeFromJson(json);

  final RewardAwardDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$RewardAwardEnvelopeToJson(this);
}
