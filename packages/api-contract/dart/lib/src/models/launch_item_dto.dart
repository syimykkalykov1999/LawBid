// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'launch_item_dto_action.dart';
import 'launch_item_dto_group.dart';
import 'launch_item_dto_status.dart';

part 'launch_item_dto.g.dart';

@JsonSerializable()
class LaunchItemDto {
  const LaunchItemDto({
    required this.id,
    required this.group,
    required this.title,
    required this.status,
    required this.detail,
    required this.hint,
    required this.runbook,
    required this.manualTick,
    required this.ticked,
    required this.action,
  });

  factory LaunchItemDto.fromJson(Map<String, Object?> json) =>
      _$LaunchItemDtoFromJson(json);

  final String id;
  final LaunchItemDtoGroup group;
  final String title;
  final LaunchItemDtoStatus status;
  final String detail;
  final String? hint;
  final String? runbook;

  /// The owner may tick it by hand.
  final bool manualTick;
  final bool ticked;
  final LaunchItemDtoAction? action;

  Map<String, Object?> toJson() => _$LaunchItemDtoToJson(this);
}
