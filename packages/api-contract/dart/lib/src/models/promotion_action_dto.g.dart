// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_action_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionActionDto _$PromotionActionDtoFromJson(Map<String, dynamic> json) =>
    PromotionActionDto(
      kind: PromotionActionDtoKind.fromJson(json['kind'] as String),
    );

Map<String, dynamic> _$PromotionActionDtoToJson(PromotionActionDto instance) =>
    <String, dynamic>{'kind': instance.kind.toJson()};
