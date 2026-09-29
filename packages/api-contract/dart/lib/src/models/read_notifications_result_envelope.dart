// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'read_notifications_result_dto.dart';
import 'response_meta_dto.dart';

part 'read_notifications_result_envelope.g.dart';

@JsonSerializable()
class ReadNotificationsResultEnvelope {
  const ReadNotificationsResultEnvelope({required this.data, this.meta});

  factory ReadNotificationsResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$ReadNotificationsResultEnvelopeFromJson(json);

  final ReadNotificationsResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$ReadNotificationsResultEnvelopeToJson(this);
}
