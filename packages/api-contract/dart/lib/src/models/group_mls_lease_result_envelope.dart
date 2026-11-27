// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_mls_lease_result_dto.dart';
import 'response_meta_dto.dart';

part 'group_mls_lease_result_envelope.g.dart';

@JsonSerializable()
class GroupMlsLeaseResultEnvelope {
  const GroupMlsLeaseResultEnvelope({required this.data, this.meta});

  factory GroupMlsLeaseResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$GroupMlsLeaseResultEnvelopeFromJson(json);

  final GroupMlsLeaseResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$GroupMlsLeaseResultEnvelopeToJson(this);
}
