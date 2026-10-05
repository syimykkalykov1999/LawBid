// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'reward_award_dto.dart';

part 'reward_award_list_envelope.g.dart';

@JsonSerializable()
class RewardAwardListEnvelope {
  const RewardAwardListEnvelope({required this.data, this.meta});

  factory RewardAwardListEnvelope.fromJson(Map<String, Object?> json) =>
      _$RewardAwardListEnvelopeFromJson(json);

  final List<RewardAwardDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$RewardAwardListEnvelopeToJson(this);
}
