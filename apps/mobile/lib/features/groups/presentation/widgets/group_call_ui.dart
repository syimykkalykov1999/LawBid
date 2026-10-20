import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/groups/application/group_call_port.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_avatar.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Mesh calls: audio 6, video 4 people (the host included).
int groupCallRingMax({required bool video}) => (video ? 4 : 6) - 1;

/// A short, translated reason a group call did not start.
String groupCallError(Translator t, String code) => switch (code) {
      'CALL_IN_PROGRESS' => t.t('call.inProgress'),
      'GROUP_FORBIDDEN' => t.t('error.api.GROUP_FORBIDDEN'),
      'CALL_STATE_CONFLICT' => t.t('call.full'),
      'MIC_DENIED' => t.t('call.micDenied'),
      _ => t.t('call.status.failed'),
    };

/// Phone / video button of a group chat: rings the chosen members.
/// A group small enough to ring everybody is rung at once; a bigger one asks
/// whom to call first. Returns the error code, or null.
Future<String?> startGroupChatCall(
  BuildContext context,
  WidgetRef ref,
  api.GroupDetailDto detail, {
  required bool video,
  required String? me,
}) async {
  final port = ref.read(groupCallPortProvider);
  if (port == null) return 'ERROR';
  final others = [
    for (final m in detail.members)
      if (m.userId != me) m,
  ];
  final max = groupCallRingMax(video: video);
  var ids = [for (final m in others.take(max)) m.userId];
  if (others.length > max) {
    final picked = await showModalBottomSheet<List<String>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).extension<AppColorTokens>()!.surface,
      builder: (_) => _CallPickerSheet(members: others, max: max, video: video),
    );
    if (picked == null) return null;
    ids = picked;
  }
  return port.start(
    detail.id,
    title: detail.title,
    avatarUrl: detail.avatarUrl,
    video: video,
    userIds: ids,
  );
}

class _CallPickerSheet extends ConsumerStatefulWidget {
  const _CallPickerSheet({
    required this.members,
    required this.max,
    required this.video,
  });

  final List<api.GroupMemberDto> members;
  final int max;
  final bool video;

  @override
  ConsumerState<_CallPickerSheet> createState() => _CallPickerSheetState();
}

class _CallPickerSheetState extends ConsumerState<_CallPickerSheet> {
  final _picked = <String>[];

  void _toggle(String id) => setState(() {
        if (!_picked.remove(id) && _picked.length < widget.max) {
          _picked.add(id);
        }
      });

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final height = MediaQuery.sizeOf(context).height * 0.8;
    return SafeArea(
      child: SizedBox(
        height: height,
        child: Column(
          children: [
            const AppSheetHandle(),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenSide,
                vertical: AppSpacing.xs,
              ),
              child: Align(
                alignment: AlignmentDirectional.centerStart,
                child: Text(
                  t.t('call.members'),
                  style: type.titleMedium.copyWith(color: colors.text),
                ),
              ),
            ),
            Expanded(
              child: ListView.builder(
                itemCount: widget.members.length,
                itemBuilder: (context, i) {
                  final m = widget.members[i];
                  final name = (m.displayName ?? m.username ?? '').trim();
                  final on = _picked.contains(m.userId);
                  return Semantics(
                    checked: on,
                    label: name,
                    excludeSemantics: true,
                    onTap: () => _toggle(m.userId),
                    child: InkWell(
                      onTap: () => _toggle(m.userId),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(
                          minHeight: AppSizes.hitTarget,
                        ),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: AppSpacing.screenSide,
                            vertical: AppSpacing.xs,
                          ),
                          child: Row(
                            children: [
                              GroupAvatar(name: name, url: m.avatarUrl),
                              const SizedBox(width: AppSpacing.md),
                              Expanded(
                                child: Text(
                                  name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: type.body.copyWith(color: colors.text),
                                ),
                              ),
                              const SizedBox(width: AppSpacing.sm),
                              AppIcon(
                                on
                                    ? AppIcons.checkCircleRounded
                                    : AppIcons.radioButtonUncheckedRounded,
                                color: on ? colors.gold : colors.textSecondary,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.screenSide),
              child: AppButton(
                key: const ValueKey('group-call-start'),
                label: t.t(widget.video ? 'call.videoButton' : 'call.button'),
                onPressed: () => Navigator.of(context).pop(
                  List<String>.of(_picked),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// «Call in progress · Join» under the header of a group chat.
class GroupCallJoinBar extends ConsumerWidget {
  const GroupCallJoinBar({
    required this.running,
    required this.onJoin,
    super.key,
  });

  final GroupRunningCall running;
  final VoidCallback onJoin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Material(
      color: colors.surface,
      child: InkWell(
        key: const ValueKey('group-call-join'),
        onTap: onJoin,
        child: Container(
          height: 48,
          padding:
              const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: colors.border)),
          ),
          child: Row(
            children: [
              AppIcon(
                running.video
                    ? AppIcons.videoCameraOutlined
                    : AppIcons.callOutlined,
                color: colors.gold,
                size: 22,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  t.t('call.ongoing'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.body.copyWith(color: colors.text),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                t.t('group.call.join'),
                maxLines: 1,
                style: type.body.copyWith(
                  color: colors.gold,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
