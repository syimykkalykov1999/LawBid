// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'deletion_cancelled_dto.dart';
import 'response_meta_dto.dart';

part 'deletion_cancelled_envelope.g.dart';

@JsonSerializable()
class DeletionCancelledEnvelope {
  const DeletionCancelledEnvelope({required this.data, this.meta});

  factory DeletionCancelledEnvelope.fromJson(Map<String, Object?> json) =>
      _$DeletionCancelledEnvelopeFromJson(json);

  final DeletionCancelledDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DeletionCancelledEnvelopeToJson(this);
}
