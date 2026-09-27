// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'deletion_pending_dto.dart';
import 'response_meta_dto.dart';

part 'deletion_pending_envelope.g.dart';

@JsonSerializable()
class DeletionPendingEnvelope {
  const DeletionPendingEnvelope({required this.data, this.meta});

  factory DeletionPendingEnvelope.fromJson(Map<String, Object?> json) =>
      _$DeletionPendingEnvelopeFromJson(json);

  final DeletionPendingDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DeletionPendingEnvelopeToJson(this);
}
