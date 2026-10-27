// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_digest_list_dto.dart';

part 'staff_digest_list_envelope.g.dart';

@JsonSerializable()
class StaffDigestListEnvelope {
  const StaffDigestListEnvelope({required this.data, this.meta});

  factory StaffDigestListEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffDigestListEnvelopeFromJson(json);

  final StaffDigestListDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffDigestListEnvelopeToJson(this);
}
