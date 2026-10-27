// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'minors_list_dto.dart';
import 'response_meta_dto.dart';

part 'minors_list_envelope.g.dart';

@JsonSerializable()
class MinorsListEnvelope {
  const MinorsListEnvelope({required this.data, this.meta});

  factory MinorsListEnvelope.fromJson(Map<String, Object?> json) =>
      _$MinorsListEnvelopeFromJson(json);

  final MinorsListDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MinorsListEnvelopeToJson(this);
}
