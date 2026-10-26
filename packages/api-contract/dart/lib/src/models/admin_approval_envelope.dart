// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_approval_dto.dart';
import 'response_meta_dto.dart';

part 'admin_approval_envelope.g.dart';

@JsonSerializable()
class AdminApprovalEnvelope {
  const AdminApprovalEnvelope({required this.data, this.meta});

  factory AdminApprovalEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminApprovalEnvelopeFromJson(json);

  final AdminApprovalDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminApprovalEnvelopeToJson(this);
}
