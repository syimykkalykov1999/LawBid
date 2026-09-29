// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'start_subscription_result_dto.dart';

part 'start_subscription_result_envelope.g.dart';

@JsonSerializable()
class StartSubscriptionResultEnvelope {
  const StartSubscriptionResultEnvelope({required this.data, this.meta});

  factory StartSubscriptionResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$StartSubscriptionResultEnvelopeFromJson(json);

  final StartSubscriptionResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$StartSubscriptionResultEnvelopeToJson(this);
}
