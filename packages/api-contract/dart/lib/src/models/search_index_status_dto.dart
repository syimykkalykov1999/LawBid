// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'search_index_entity_dto.dart';
import 'search_index_status_dto_next_swap.dart';
import 'search_index_status_dto_phase.dart';
import 'search_index_status_dto_progress_entity.dart';
import 'search_index_status_dto_source.dart';
import 'search_index_verify_dto.dart';

part 'search_index_status_dto.g.dart';

@JsonSerializable()
class SearchIndexStatusDto {
  const SearchIndexStatusDto({
    required this.engineConfigured,
    required this.mappingVersion,
    required this.phase,
    required this.source,
    required this.startedAt,
    required this.error,
    required this.progressEntity,
    required this.progressIndexed,
    required this.progressTotal,
    required this.progressDone,
    required this.verifyOk,
    required this.verifiedAt,
    required this.verify,
    required this.retainUntil,
    required this.nextSwap,
    required this.canStart,
    required this.canSwap,
    required this.canRollback,
    required this.entities,
  });
  
  factory SearchIndexStatusDto.fromJson(Map<String, Object?> json) => _$SearchIndexStatusDtoFromJson(json);
  
  final bool engineConfigured;

  /// Mapping revision in the code.
  final num mappingVersion;
  final SearchIndexStatusDtoPhase? phase;
  final SearchIndexStatusDtoSource? source;
  final String? startedAt;
  final String? error;
  final SearchIndexStatusDtoProgressEntity? progressEntity;

  /// Documents written to the new index so far.
  final num progressIndexed;

  /// Native copy: documents to copy (0 unknown).
  final num progressTotal;

  /// Native copy: documents copied so far.
  final num progressDone;
  final bool? verifyOk;
  final String? verifiedAt;
  final List<SearchIndexVerifyDto> verify;
  final String? retainUntil;

  /// What the Swap button does now.
  final SearchIndexStatusDtoNextSwap? nextSwap;
  final bool canStart;
  final bool canSwap;
  final bool canRollback;
  final List<SearchIndexEntityDto> entities;

  Map<String, Object?> toJson() => _$SearchIndexStatusDtoToJson(this);
}
