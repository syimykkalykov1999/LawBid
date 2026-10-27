// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cost_registry_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CostRegistryRowDto _$CostRegistryRowDtoFromJson(
  Map<String, dynamic> json,
) => CostRegistryRowDto(
  stateKnown: json['stateKnown'] as bool,
  name: json['name'] as String,
  purpose: json['purpose'] as String,
  kind: CostRegistryRowDtoKind.fromJson(json['kind'] as String),
  controlType: CostRegistryRowDtoControlType.fromJson(
    json['controlType'] as String,
  ),
  controlKey: json['controlKey'] as String,
  editable: json['editable'] as bool,
  infraSwitch: json['infraSwitch'] as bool,
  lockedReason: json['lockedReason'] as String?,
  states: (json['states'] as List<dynamic>)
      .map((e) => CostRegistryRowDtoStates.fromJson(e as String))
      .toList(),
  defaultState: CostRegistryRowDtoDefaultState.fromJson(
    json['defaultState'] as String,
  ),
  state: json['state'] == null
      ? null
      : CostRegistryRowDtoState.fromJson(json['state'] as String),
  id: json['id'] as String,
  stateNote: json['stateNote'] as String?,
  stateHints: Map<String, String>.from(json['stateHints'] as Map),
  ceilingLabel: json['ceilingLabel'] as String?,
  ceilingKey: json['ceilingKey'] as String?,
  ceilingWhere: json['ceilingWhere'] as String?,
  priceText: json['priceText'] as String,
  priceModel: json['priceModel'] as String,
  priceSourceUrl: json['priceSourceUrl'] as String,
  priceCheckedAt: json['priceCheckedAt'] as String,
  priceVerified: json['priceVerified'] as bool,
  usdLaunch: (json['usdLaunch'] as List<dynamic>).map((e) => e as num).toList(),
  steps: (json['steps'] as Map<String, dynamic>).map(
    (k, e) =>
        MapEntry(k, (e as List<dynamic>).map((e) => e as String).toList()),
  ),
  usdM1: (json['usdM1'] as List<dynamic>).map((e) => e as num).toList(),
  ifOnUsd: (json['ifOnUsd'] as List<dynamic>?)?.map((e) => e as num).toList(),
  needed: CostRegistryRowDtoNeeded.fromJson(json['needed'] as String),
  neededNote: json['neededNote'] as String,
  alarm: json['alarm'] as String?,
  note: json['note'] as String?,
  ceService: json['ceService'] as String?,
  status: CostRowStatusDto.fromJson(json['status'] as Map<String, dynamic>),
  monthUsd: json['monthUsd'] as num?,
  projectedUsd: json['projectedUsd'] as num?,
  monthSource: CostRegistryRowDtoMonthSource.fromJson(
    json['monthSource'] as String,
  ),
  usdK100: (json['usdK100'] as List<dynamic>).map((e) => e as num).toList(),
);

Map<String, dynamic> _$CostRegistryRowDtoToJson(CostRegistryRowDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'purpose': instance.purpose,
      'kind': instance.kind.toJson(),
      'controlType': instance.controlType.toJson(),
      'controlKey': instance.controlKey,
      'editable': instance.editable,
      'infraSwitch': instance.infraSwitch,
      'lockedReason': ?instance.lockedReason,
      'states': instance.states.map((e) => e.toJson()).toList(),
      'defaultState': instance.defaultState.toJson(),
      'state': ?instance.state?.toJson(),
      'stateKnown': instance.stateKnown,
      'stateNote': ?instance.stateNote,
      'stateHints': instance.stateHints,
      'ceilingLabel': ?instance.ceilingLabel,
      'ceilingKey': ?instance.ceilingKey,
      'ceilingWhere': ?instance.ceilingWhere,
      'priceText': instance.priceText,
      'priceModel': instance.priceModel,
      'priceSourceUrl': instance.priceSourceUrl,
      'priceCheckedAt': instance.priceCheckedAt,
      'priceVerified': instance.priceVerified,
      'usdLaunch': instance.usdLaunch,
      'usdK100': instance.usdK100,
      'usdM1': instance.usdM1,
      'ifOnUsd': ?instance.ifOnUsd,
      'needed': instance.needed.toJson(),
      'neededNote': instance.neededNote,
      'alarm': ?instance.alarm,
      'note': ?instance.note,
      'ceService': ?instance.ceService,
      'status': instance.status.toJson(),
      'monthUsd': ?instance.monthUsd,
      'projectedUsd': ?instance.projectedUsd,
      'monthSource': instance.monthSource.toJson(),
      'steps': instance.steps,
    };
