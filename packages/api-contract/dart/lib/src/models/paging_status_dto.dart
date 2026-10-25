// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'paging_status_dto_state.dart';

part 'paging_status_dto.g.dart';

@JsonSerializable()
class PagingStatusDto {
  const PagingStatusDto({
    required this.available,
    required this.configured,
    required this.endpointMasked,
    required this.state,
    required this.stale,
    required this.checkedAt,
  });

  factory PagingStatusDto.fromJson(Map<String, Object?> json) =>
      _$PagingStatusDtoFromJson(json);

  final bool available;
  final bool configured;
  final String? endpointMasked;
  final PagingStatusDtoState state;
  final bool stale;
  final String checkedAt;

  Map<String, Object?> toJson() => _$PagingStatusDtoToJson(this);
}
