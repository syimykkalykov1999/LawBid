// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'attorney_list_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AttorneyListItemDto _$AttorneyListItemDtoFromJson(Map<String, dynamic> json) =>
    AttorneyListItemDto(
      id: json['id'] as String,
      username: json['username'] as String,
      verifiedBadge: json['verifiedBadge'] as bool,
      rating: RatingDto.fromJson(json['rating'] as Map<String, dynamic>),
      states: (json['states'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      isFollowing: json['isFollowing'] as bool,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
    );

Map<String, dynamic> _$AttorneyListItemDtoToJson(
  AttorneyListItemDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'username': instance.username,
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'avatarUrl': ?instance.avatarUrl,
  'verifiedBadge': instance.verifiedBadge,
  'rating': instance.rating.toJson(),
  'states': instance.states,
  'isFollowing': instance.isFollowing,
};
