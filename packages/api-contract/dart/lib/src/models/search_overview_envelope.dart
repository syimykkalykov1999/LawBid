// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'search_overview_dto.dart';

part 'search_overview_envelope.g.dart';

@JsonSerializable()
class SearchOverviewEnvelope {
  const SearchOverviewEnvelope({required this.data, this.meta});

  factory SearchOverviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$SearchOverviewEnvelopeFromJson(json);

  final SearchOverviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SearchOverviewEnvelopeToJson(this);
}
