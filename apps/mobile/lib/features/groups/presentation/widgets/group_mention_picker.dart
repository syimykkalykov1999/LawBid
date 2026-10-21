import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_style.dart';
import 'package:lawbid/shared/people/people_suggest_list.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The list of members that opens above the composer while typing «@».
/// Only members can be mentioned in a group (Telegram); the rows are the
/// app's one people row (photo, name, @username).
class GroupMentionPicker extends StatelessWidget {
  const GroupMentionPicker({
    required this.members,
    required this.t,
    required this.onPick,
    super.key,
  });

  final List<api.GroupMemberDto> members;
  final Translator t;
  final void Function(api.GroupMemberDto member) onPick;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Material(
      color: colors.surface,
      child: Container(
        constraints: const BoxConstraints(maxHeight: 220),
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: colors.border)),
        ),
        child: ListView.builder(
          shrinkWrap: true,
          padding: EdgeInsets.zero,
          itemCount: members.length,
          itemBuilder: (context, i) {
            final m = members[i];
            return PersonSuggestionTile(
              avatarSize: 32,
              person: SuggestedPerson(
                id: m.userId,
                username: m.username ?? '',
                name: groupMemberName(t, m),
                avatarUrl: m.avatarUrl,
                verified: m.verifiedBadge,
              ),
              onTap: () => onPick(m),
            );
          },
        ),
      ),
    );
  }
}
