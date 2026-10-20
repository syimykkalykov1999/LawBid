import 'package:flutter/material.dart';

/// A person that can be put into a group.
class PickedPerson {
  const PickedPerson({
    required this.userId,
    required this.name,
    this.avatarUrl,
  });

  final String userId;
  final String name;
  final String? avatarUrl;
}

/// PLACEHOLDER (replaced): a sheet to pick people from the people the user
/// already chats with. Returns the picked people, or null when dismissed.
Future<List<PickedPerson>?> showPeoplePicker(
  BuildContext context, {
  Set<String> excludeIds = const {},
  String? titleKey,
}) async =>
    null;
