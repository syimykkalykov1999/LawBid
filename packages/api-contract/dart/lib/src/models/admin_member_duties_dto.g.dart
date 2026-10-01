// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_member_duties_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminMemberDutiesDto _$AdminMemberDutiesDtoFromJson(
  Map<String, dynamic> json,
) => AdminMemberDutiesDto(
  duties: (json['duties'] as List<dynamic>)
      .map((e) => AdminMemberDutiesDtoDuties.fromJson(e as String))
      .toList(),
);

Map<String, dynamic> _$AdminMemberDutiesDtoToJson(
  AdminMemberDutiesDto instance,
) => <String, dynamic>{
  'duties': instance.duties.map((e) => e.toJson()).toList(),
};
