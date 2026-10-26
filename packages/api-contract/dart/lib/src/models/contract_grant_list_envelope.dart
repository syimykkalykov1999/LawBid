// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contract_grant_dto.dart';
import 'response_meta_dto.dart';

part 'contract_grant_list_envelope.g.dart';

@JsonSerializable()
class ContractGrantListEnvelope {
  const ContractGrantListEnvelope({required this.data, this.meta});

  factory ContractGrantListEnvelope.fromJson(Map<String, Object?> json) =>
      _$ContractGrantListEnvelopeFromJson(json);

  final List<ContractGrantDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ContractGrantListEnvelopeToJson(this);
}
