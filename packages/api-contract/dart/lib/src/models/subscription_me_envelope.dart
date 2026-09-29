// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'subscription_me_dto.dart';

part 'subscription_me_envelope.g.dart';

@JsonSerializable()
class SubscriptionMeEnvelope {
  const SubscriptionMeEnvelope({required this.data, this.meta});

  factory SubscriptionMeEnvelope.fromJson(Map<String, Object?> json) =>
      _$SubscriptionMeEnvelopeFromJson(json);

  final SubscriptionMeDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SubscriptionMeEnvelopeToJson(this);
}
