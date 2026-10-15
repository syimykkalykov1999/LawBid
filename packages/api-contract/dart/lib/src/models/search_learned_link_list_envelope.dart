// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'search_learned_link_dto.dart';

part 'search_learned_link_list_envelope.g.dart';

@JsonSerializable()
class SearchLearnedLinkListEnvelope {
  const SearchLearnedLinkListEnvelope({required this.data, this.meta});

  factory SearchLearnedLinkListEnvelope.fromJson(Map<String, Object?> json) =>
      _$SearchLearnedLinkListEnvelopeFromJson(json);

  final List<SearchLearnedLinkDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SearchLearnedLinkListEnvelopeToJson(this);
}
