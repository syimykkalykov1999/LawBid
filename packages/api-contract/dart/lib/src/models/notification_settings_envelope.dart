// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'notification_settings_dto.dart';
import 'response_meta_dto.dart';

part 'notification_settings_envelope.g.dart';

@JsonSerializable()
class NotificationSettingsEnvelope {
  const NotificationSettingsEnvelope({required this.data, this.meta});

  factory NotificationSettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$NotificationSettingsEnvelopeFromJson(json);

  final NotificationSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$NotificationSettingsEnvelopeToJson(this);
}
