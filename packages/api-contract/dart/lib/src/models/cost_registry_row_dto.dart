// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'cost_registry_row_dto_control_type.dart';
import 'cost_registry_row_dto_default_state.dart';
import 'cost_registry_row_dto_kind.dart';
import 'cost_registry_row_dto_month_source.dart';
import 'cost_registry_row_dto_needed.dart';
import 'cost_registry_row_dto_state.dart';
import 'cost_registry_row_dto_states.dart';
import 'cost_row_status_dto.dart';

part 'cost_registry_row_dto.g.dart';

@JsonSerializable()
class CostRegistryRowDto {
  const CostRegistryRowDto({
    required this.stateKnown,
    required this.name,
    required this.purpose,
    required this.kind,
    required this.controlType,
    required this.controlKey,
    required this.editable,
    required this.infraSwitch,
    required this.lockedReason,
    required this.states,
    required this.defaultState,
    required this.state,
    required this.id,
    required this.stateNote,
    required this.stateHints,
    required this.ceilingLabel,
    required this.ceilingKey,
    required this.ceilingWhere,
    required this.priceText,
    required this.priceModel,
    required this.priceSourceUrl,
    required this.priceCheckedAt,
    required this.priceVerified,
    required this.usdLaunch,
    required this.steps,
    required this.usdM1,
    required this.ifOnUsd,
    required this.needed,
    required this.neededNote,
    required this.alarm,
    required this.note,
    required this.ceService,
    required this.status,
    required this.monthUsd,
    required this.projectedUsd,
    required this.monthSource,
    required this.usdK100,
  });

  factory CostRegistryRowDto.fromJson(Map<String, Object?> json) =>
      _$CostRegistryRowDtoFromJson(json);

  final String id;
  final String name;
  final String purpose;
  final CostRegistryRowDtoKind kind;
  final CostRegistryRowDtoControlType controlType;

  /// Setting key, SSM switch, Terraform variables, or the reason it is fixed.
  final String controlKey;

  /// The owner can flip it from this page.
  final bool editable;

  /// A Terraform switch: Выкл / Вкл creates a cloud change request (POST /admin/infra/requests).
  final bool infraSwitch;
  final String? lockedReason;
  final List<CostRegistryRowDtoStates> states;
  final CostRegistryRowDtoDefaultState defaultState;
  final CostRegistryRowDtoState? state;

  /// false: the state is the code default or unreadable.
  final bool stateKnown;
  final String? stateNote;

  /// state → what that position means, where it is not obvious.
  final Map<String, String> stateHints;
  final String? ceilingLabel;
  final String? ceilingKey;
  final String? ceilingWhere;
  final String priceText;
  final String priceModel;
  final String priceSourceUrl;
  final String priceCheckedAt;
  final bool priceVerified;

  /// [min, max] $/month at launch.
  final List<num> usdLaunch;
  final List<num> usdK100;
  final List<num> usdM1;
  final List<num>? ifOnUsd;
  final CostRegistryRowDtoNeeded needed;
  final String neededNote;
  final String? alarm;
  final String? note;

  /// AWS Cost Explorer service name whose bill belongs to the row.
  final String? ceService;
  final CostRowStatusDto status;
  final num? monthUsd;
  final num? projectedUsd;
  final CostRegistryRowDtoMonthSource monthSource;

  /// state → plain-Russian steps to put the item in that state.
  final Map<String, List<String>> steps;

  Map<String, Object?> toJson() => _$CostRegistryRowDtoToJson(this);
}
