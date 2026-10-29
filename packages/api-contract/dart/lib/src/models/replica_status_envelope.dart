// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'replica_status_dto.dart';
import 'response_meta_dto.dart';

part 'replica_status_envelope.g.dart';

@JsonSerializable()
class ReplicaStatusEnvelope {
  const ReplicaStatusEnvelope({
    required this.data,
    this.meta,
  });
  
  factory ReplicaStatusEnvelope.fromJson(Map<String, Object?> json) => _$ReplicaStatusEnvelopeFromJson(json);
  
  final ReplicaStatusDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ReplicaStatusEnvelopeToJson(this);
}
