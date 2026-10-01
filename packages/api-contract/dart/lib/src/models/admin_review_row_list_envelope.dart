// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_review_row_dto.dart';
import 'response_meta_dto.dart';

part 'admin_review_row_list_envelope.g.dart';

@JsonSerializable()
class AdminReviewRowListEnvelope {
  const AdminReviewRowListEnvelope({required this.data, this.meta});

  factory AdminReviewRowListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminReviewRowListEnvelopeFromJson(json);

  final List<AdminReviewRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminReviewRowListEnvelopeToJson(this);
}
