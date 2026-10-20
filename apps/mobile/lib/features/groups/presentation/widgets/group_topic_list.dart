import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/groups/presentation/group_message_text.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_style.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_topic_sheets.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The topics of a forum group («General» first): a coloured circle with
/// the emoji, title, last message, pinned / closed marks and the unread
/// and mention badges. A tap opens the topic; admins create topics and
/// edit one with a long press.
class GroupTopicList extends ConsumerWidget {
  const GroupTopicList({required this.detail, super.key});

  final api.GroupDetailDto detail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final id = detail.id;
    final topics = ref.watch(groupTopicsProvider(id));
    return topics.when(
      loading: () => const CasesListSkeleton(),
      error: (e, _) => CasesErrorView(
        error: e,
        t: t,
        onRetry: () => ref.invalidate(groupTopicsProvider(id)),
      ),
      data: (list) {
        final sorted = [
          ...list.where((x) => x.isGeneral),
          ...list.where((x) => !x.isGeneral && x.pinned),
          ...list.where((x) => !x.isGeneral && !x.pinned),
        ];
        return Column(
          children: [
            Expanded(
              child: sorted.isEmpty
                  ? AppEmptyState(
                      icon: AppIcons.forumOutlined,
                      message: t.t('group.topic.empty'),
                    )
                  : RefreshIndicator(
                      onRefresh: () async {
                        ref.invalidate(groupTopicsProvider(id));
                        await ref.read(groupTopicsProvider(id).future);
                      },
                      child: ListView.separated(
                        padding: const EdgeInsets.only(top: AppSpacing.xs),
                        itemCount: sorted.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (context, i) => _TopicRow(
                          topic: sorted[i],
                          isAdmin: detail.isAdmin,
                          groupId: id,
                        ),
                      ),
                    ),
            ),
            if (detail.isAdmin)
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.screenSide),
                  child: AppButton(
                    label: t.t('group.topic.new'),
                    icon: AppIcons.addRounded,
                    onPressed: () => showTopicEditorSheet(context, groupId: id),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _TopicRow extends ConsumerWidget {
  const _TopicRow({
    required this.topic,
    required this.isAdmin,
    required this.groupId,
  });

  final api.GroupTopicDto topic;
  final bool isAdmin;
  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final last = topic.lastMessage;
    final at = topic.lastMessageAt;
    final unread = topic.unreadCount.toInt();
    final mentions = topic.unreadMentions.toInt();
    final emoji = topic.iconEmoji?.trim();
    final now = DateTime.now();
    final when = at == null
        ? null
        : (DateUtils.isSameDay(at.toLocal(), now)
            ? f.time(at)
            : f.dayMonth(at));

    Widget badge(Widget child) => Container(
          constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
          padding: const EdgeInsets.symmetric(horizontal: 6),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: colors.gold,
            borderRadius: BorderRadius.circular(AppRadii.pill),
          ),
          child: child,
        );
    final badgeStyle = type.caption.copyWith(
      color: colors.navy,
      fontWeight: FontWeight.w700,
      fontSize: 11,
    );

    return Semantics(
      button: true,
      label: [
        topic.title,
        if (topic.closed) t.t('group.topic.closed'),
        if (unread > 0) '$unread',
      ].join(', '),
      excludeSemantics: true,
      child: AppPressable(
        onTap: () =>
            context.push(GroupRoutes.group(groupId, topicId: topic.id)),
        onLongPress: isAdmin
            ? () => showTopicEditorSheet(
                  context,
                  groupId: groupId,
                  topic: topic,
                )
            : null,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 64),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenSide,
              vertical: AppSpacing.sm,
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: groupTopicColor(topic.color),
                  ),
                  child: emoji != null && emoji.isNotEmpty
                      ? Text(emoji, style: const TextStyle(fontSize: 22))
                      : const AppIcon(
                          AppIcons.tagRounded,
                          color: Colors.white,
                        ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              topic.isGeneral
                                  ? t.t('group.topic.general')
                                  : topic.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: type.body.copyWith(
                                color: colors.text,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          if (topic.closed) ...[
                            const SizedBox(width: AppSpacing.xs),
                            AppIcon(
                              AppIcons.lockOutlineRounded,
                              size: 14,
                              color: colors.textSecondary,
                            ),
                          ],
                        ],
                      ),
                      if (last != null)
                        Text(
                          groupMessagePreview(t, last, withSender: true),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.bodySmall
                              .copyWith(color: colors.textSecondary),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (when != null)
                      Text(
                        when,
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                    const SizedBox(height: 2),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (topic.pinned)
                          AppIcon(
                            AppIcons.pushPin,
                            size: 14,
                            color: colors.textSecondary,
                          ),
                        if (mentions > 0) ...[
                          const SizedBox(width: 4),
                          badge(Text('@', style: badgeStyle)),
                        ],
                        if (unread > 0) ...[
                          const SizedBox(width: 4),
                          badge(
                            Text(
                              unread > 99 ? '99+' : '$unread',
                              style: badgeStyle,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
