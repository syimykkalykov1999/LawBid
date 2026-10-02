// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_case_card_dto.dart';
import 'response_meta_dto.dart';

part 'admin_case_card_envelope.g.dart';

@JsonSerializable()
class AdminCaseCardEnvelope {
  const AdminCaseCardEnvelope({required this.data, this.meta});

  factory AdminCaseCardEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminCaseCardEnvelopeFromJson(json);

  final AdminCaseCardDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminCaseCardEnvelopeToJson(this);
}
