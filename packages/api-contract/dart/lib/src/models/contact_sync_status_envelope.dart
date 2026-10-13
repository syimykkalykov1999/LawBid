// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contact_sync_status_dto.dart';
import 'response_meta_dto.dart';

part 'contact_sync_status_envelope.g.dart';

@JsonSerializable()
class ContactSyncStatusEnvelope {
  const ContactSyncStatusEnvelope({required this.data, this.meta});

  factory ContactSyncStatusEnvelope.fromJson(Map<String, Object?> json) =>
      _$ContactSyncStatusEnvelopeFromJson(json);

  final ContactSyncStatusDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ContactSyncStatusEnvelopeToJson(this);
}
