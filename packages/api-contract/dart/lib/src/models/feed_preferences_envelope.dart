// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'feed_preferences_dto.dart';
import 'response_meta_dto.dart';

part 'feed_preferences_envelope.g.dart';

@JsonSerializable()
class FeedPreferencesEnvelope {
  const FeedPreferencesEnvelope({required this.data, this.meta});

  factory FeedPreferencesEnvelope.fromJson(Map<String, Object?> json) =>
      _$FeedPreferencesEnvelopeFromJson(json);

  final FeedPreferencesDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$FeedPreferencesEnvelopeToJson(this);
}
