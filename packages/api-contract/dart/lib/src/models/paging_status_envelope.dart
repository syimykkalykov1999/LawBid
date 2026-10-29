// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'paging_status_dto.dart';
import 'response_meta_dto.dart';

part 'paging_status_envelope.g.dart';

@JsonSerializable()
class PagingStatusEnvelope {
  const PagingStatusEnvelope({
    required this.data,
    this.meta,
  });
  
  factory PagingStatusEnvelope.fromJson(Map<String, Object?> json) => _$PagingStatusEnvelopeFromJson(json);
  
  final PagingStatusDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PagingStatusEnvelopeToJson(this);
}
