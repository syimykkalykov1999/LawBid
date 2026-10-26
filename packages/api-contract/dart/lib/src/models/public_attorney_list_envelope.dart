// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'public_attorney_dto.dart';
import 'response_meta_dto.dart';

part 'public_attorney_list_envelope.g.dart';

@JsonSerializable()
class PublicAttorneyListEnvelope {
  const PublicAttorneyListEnvelope({required this.data, this.meta});

  factory PublicAttorneyListEnvelope.fromJson(Map<String, Object?> json) =>
      _$PublicAttorneyListEnvelopeFromJson(json);

  final List<PublicAttorneyDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PublicAttorneyListEnvelopeToJson(this);
}
