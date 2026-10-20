// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'channel_subscription_dto.dart';
import 'response_meta_dto.dart';

part 'channel_subscription_envelope.g.dart';

@JsonSerializable()
class ChannelSubscriptionEnvelope {
  const ChannelSubscriptionEnvelope({required this.data, this.meta});

  factory ChannelSubscriptionEnvelope.fromJson(Map<String, Object?> json) =>
      _$ChannelSubscriptionEnvelopeFromJson(json);

  final ChannelSubscriptionDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ChannelSubscriptionEnvelopeToJson(this);
}
