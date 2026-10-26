// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'my_rewards_dto.dart';
import 'response_meta_dto.dart';

part 'my_rewards_envelope.g.dart';

@JsonSerializable()
class MyRewardsEnvelope {
  const MyRewardsEnvelope({required this.data, this.meta});

  factory MyRewardsEnvelope.fromJson(Map<String, Object?> json) =>
      _$MyRewardsEnvelopeFromJson(json);

  final MyRewardsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MyRewardsEnvelopeToJson(this);
}
