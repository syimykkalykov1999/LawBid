import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_section.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_sheets.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_style.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_topic_sheets.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

enum _TopicAction { edit, close, reopen, pin, unpin }

/// «Topics» of a forum group, for admins: open a topic, edit it, close or
/// reopen it, pin or unpin it, and create a new one.
class GroupInfoTopics extends ConsumerStatefulWidget {
  const GroupInfoTopics({required this.groupId, super.key});

  final String groupId;

  @override
  ConsumerState<GroupInfoTopics> createState() => _GroupInfoTopicsState();
}

class _GroupInfoTopicsState extends ConsumerState<GroupInfoTopics> {
  Future<void> _update(
    api.GroupTopicDto topic,
    api.UpdateTopicDto change,
  ) async {
    final t = ref.read(translatorProvider);
    try {
      await ref
          .read(groupRepositoryProvider)
          .updateTopic(widget.groupId, topic.id, change);
      if (mounted) ref.invalidate(groupTopicsProvider(widget.groupId));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _menu(api.GroupTopicDto topic) async {
    final t = ref.read(translatorProvider);
    final action = await showGroupChoiceSheet<_TopicAction>(
      context,
      title: topic.title,
      choices: [
        if (!topic.isGeneral)
          GroupChoice(
            value: _TopicAction.edit,
            label: t.t('group.info.topics.edit'),
            icon: AppIcons.editOutlined,
          ),
        GroupChoice(
          value: topic.pinned ? _TopicAction.unpin : _TopicAction.pin,
          label: t.t(
            topic.pinned ? 'group.info.topics.unpin' : 'group.info.topics.pin',
          ),
          icon: topic.pinned ? AppIcons.pushPin : AppIcons.pushPinOutlined,
        ),
        if (!topic.isGeneral)
          GroupChoice(
            value: topic.closed ? _TopicAction.reopen : _TopicAction.close,
            label: t.t(
              topic.closed
                  ? 'group.info.topics.reopen'
                  : 'group.info.topics.close',
            ),
            icon: topic.closed
                ? AppIcons.lockOpenRounded
                : AppIcons.lockOutlineRounded,
          ),
      ],
    );
    if (action == null || !mounted) return;
    switch (action) {
      case _TopicAction.edit:
        final changed = await showTopicEditorSheet(
          context,
          groupId: widget.groupId,
          topic: topic,
        );
        if (changed && mounted) {
          ref.invalidate(groupTopicsProvider(widget.groupId));
        }
      case _TopicAction.close:
        await _update(topic, const api.UpdateTopicDto(closed: true));
      case _TopicAction.reopen:
        await _update(topic, const api.UpdateTopicDto(closed: false));
      case _TopicAction.pin:
        await _update(topic, const api.UpdateTopicDto(pinned: true));
      case _TopicAction.unpin:
        await _update(topic, const api.UpdateTopicDto(pinned: false));
    }
  }

  Future<void> _create() async {
    final created = await showTopicEditorSheet(
      context,
      groupId: widget.groupId,
    );
    if (created && mounted) {
      ref.invalidate(groupTopicsProvider(widget.groupId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final async = ref.watch(groupTopicsProvider(widget.groupId));

    Widget row(api.GroupTopicDto topic) {
      final status = [
        if (topic.pinned) t.t('group.info.topics.pinned'),
        if (topic.closed) t.t('group.info.topics.closed'),
      ].join(' · ');
      return Semantics(
        container: true,
        button: true,
        label: status.isEmpty ? topic.title : '${topic.title}, $status',
        excludeSemantics: true,
        child: InkWell(
          key: ValueKey('group-topic-${topic.id}'),
          onTap: () => context.push(
            GroupRoutes.group(widget.groupId, topicId: topic.id),
          ),
          onLongPress: () => _menu(topic),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 56),
            child: Padding(
              padding: const EdgeInsetsDirectional.only(
                start: AppSpacing.md,
                end: AppSpacing.xs,
                top: AppSpacing.sm,
                bottom: AppSpacing.sm,
              ),
              child: Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: groupTopicColor(topic.color),
                    ),
                    child: Text(
                      topic.iconEmoji ??
                          (topic.isGeneral
                              ? '#'
                              : avatarInitials(topic.title).substring(0, 1)),
                      textScaler: TextScaler.noScaling,
                      style: type.body.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          topic.isGeneral
                              ? t.t('group.info.topics.general')
                              : topic.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.body.copyWith(
                            color: colors.text,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        if (status.isNotEmpty)
                          Text(
                            status,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.caption.copyWith(
                              color: colors.textSecondary,
                            ),
                          ),
                      ],
                    ),
                  ),
                  AppIconButton(
                    icon: AppIcon(
                      AppIcons.moreVertRounded,
                      color: colors.textSecondary,
                    ),
                    semanticLabel: t.t('group.info.topics.actions'),
                    onPressed: () => _menu(topic),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return GroupInfoSection(
      title: t.t('group.info.topics.title'),
      children: [
        async.when(
          skipLoadingOnReload: true,
          loading: () => const Padding(
            padding: EdgeInsets.all(AppSpacing.xl),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          ),
          error: (e, _) => Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              children: [
                Text(
                  errorText(t, e),
                  textAlign: TextAlign.center,
                  style: type.bodySmall.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  label: t.t('error.retry'),
                  variant: AppButtonVariant.secondary,
                  height: AppSizes.touchTarget,
                  onPressed: () =>
                      ref.invalidate(groupTopicsProvider(widget.groupId)),
                ),
              ],
            ),
          ),
          data: (topics) => Column(children: [for (final x in topics) row(x)]),
        ),
        AppListRow(
          key: const ValueKey('group-topic-new'),
          icon: AppIcons.addRounded,
          label: t.t('group.info.topics.new'),
          showChevron: false,
          onTap: _create,
        ),
      ],
    );
  }
}
