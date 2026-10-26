// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_client_review_row_dto.dart';
import 'response_meta_dto.dart';

part 'admin_client_review_row_list_envelope.g.dart';

@JsonSerializable()
class AdminClientReviewRowListEnvelope {
  const AdminClientReviewRowListEnvelope({required this.data, this.meta});

  factory AdminClientReviewRowListEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AdminClientReviewRowListEnvelopeFromJson(json);

  final List<AdminClientReviewRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminClientReviewRowListEnvelopeToJson(this);
}
