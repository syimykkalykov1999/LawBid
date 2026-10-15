// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'crash_group_dto.dart';
import 'response_meta_dto.dart';

part 'crash_group_list_envelope.g.dart';

@JsonSerializable()
class CrashGroupListEnvelope {
  const CrashGroupListEnvelope({required this.data, this.meta});

  factory CrashGroupListEnvelope.fromJson(Map<String, Object?> json) =>
      _$CrashGroupListEnvelopeFromJson(json);

  final List<CrashGroupDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CrashGroupListEnvelopeToJson(this);
}
