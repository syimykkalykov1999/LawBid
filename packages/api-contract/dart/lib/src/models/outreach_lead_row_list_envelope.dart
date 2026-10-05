// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_lead_row_dto.dart';
import 'response_meta_dto.dart';

part 'outreach_lead_row_list_envelope.g.dart';

@JsonSerializable()
class OutreachLeadRowListEnvelope {
  const OutreachLeadRowListEnvelope({required this.data, this.meta});

  factory OutreachLeadRowListEnvelope.fromJson(Map<String, Object?> json) =>
      _$OutreachLeadRowListEnvelopeFromJson(json);

  final List<OutreachLeadRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$OutreachLeadRowListEnvelopeToJson(this);
}
