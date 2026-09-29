// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'owner_case_detail_dto.dart';
import 'response_meta_dto.dart';

part 'owner_case_detail_envelope.g.dart';

@JsonSerializable()
class OwnerCaseDetailEnvelope {
  const OwnerCaseDetailEnvelope({required this.data, this.meta});

  factory OwnerCaseDetailEnvelope.fromJson(Map<String, Object?> json) =>
      _$OwnerCaseDetailEnvelopeFromJson(json);

  final OwnerCaseDetailDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$OwnerCaseDetailEnvelopeToJson(this);
}
