// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'feature_flag_admin_dto.dart';
import 'response_meta_dto.dart';

part 'feature_flag_admin_list_envelope.g.dart';

@JsonSerializable()
class FeatureFlagAdminListEnvelope {
  const FeatureFlagAdminListEnvelope({required this.data, this.meta});

  factory FeatureFlagAdminListEnvelope.fromJson(Map<String, Object?> json) =>
      _$FeatureFlagAdminListEnvelopeFromJson(json);

  final List<FeatureFlagAdminDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$FeatureFlagAdminListEnvelopeToJson(this);
}
