// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contract_grant_dto.dart';
import 'response_meta_dto.dart';

part 'contract_grant_envelope.g.dart';

@JsonSerializable()
class ContractGrantEnvelope {
  const ContractGrantEnvelope({required this.data, this.meta});

  factory ContractGrantEnvelope.fromJson(Map<String, Object?> json) =>
      _$ContractGrantEnvelopeFromJson(json);

  final ContractGrantDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ContractGrantEnvelopeToJson(this);
}
