import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/domain/forward.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/shared/people/people_suggest_list.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-21 (Telegram / WhatsApp «Переслать»): «Forward to…» for
/// any message — picks chats, groups and channels (several at once), then
/// sends [sources] (oldest first) in one request; a snackbar says how it
/// went. Every forward goes through the server, so «Forwarded from …», the
/// target's rules and the disappearing / protected checks always apply.
Future<void> forwardWithSheet(
  BuildContext context,
  WidgetRef ref,
  List<ForwardSource> sources,
) async {
  if (sources.isEmpty) return;
  final picked = await showAppBottomSheet<List<ForwardTarget>>(
    context: context,
    isScrollControlled: true,
    builder: (_) => const ForwardTargetSheet(),
  );
  if (picked == null || picked.isEmpty || !context.mounted) return;
  final message = await sendForward(ref, sources, picked);
  if (context.mounted) showAppSnackBar(context, message);
}

/// Sends one forward and returns the text to show: done, partly done, or
/// why it failed (the target's error when every pair was refused).
Future<String> sendForward(
  WidgetRef ref,
  List<ForwardSource> sources,
  List<ForwardTarget> targets,
) async {
  final t = ref.read(translatorProvider);
  try {
    final results = await ref.read(chatRepositoryProvider).forwardBatch(
          newClientMessageId(),
          sources.take(kForwardMaxSources).toList(),
          targets.take(kForwardMaxTargets).toList(),
        );
    final failed = results.where((r) => !r.sent).toList();
    if (failed.isEmpty) return t.t('chat.forward.done');
    if (failed.length < results.length) return t.t('chat.forward.partial');
    final code = failed.first.code;
    return code == null
        ? t.t('chat.forward.failed')
        : apiErrorText(t, ApiException(code: code, message: code));
  } on ApiException catch (e) {
    return apiErrorText(t, e);
  } on Object {
    return t.t('chat.forward.failed');
  }
}

/// One row of the sheet.
@immutable
class _Row {
  const _Row({
    required this.target,
    required this.title,
    required this.enabled,
    this.avatarUrl,
  });

  final ForwardTarget target;
  final String title;
  final String? avatarUrl;
  final bool enabled;
}

/// The chats as a searchable multi-select list in three sections — Chats,
/// Groups, Channels (the ones I run) — with Send. Rows where I cannot write
/// (a closed chat, an admins-only group) are greyed out. Pops the picked
/// targets.
class ForwardTargetSheet extends ConsumerStatefulWidget {
  const ForwardTargetSheet({super.key});

  @override
  ConsumerState<ForwardTargetSheet> createState() => _ForwardTargetSheetState();
}

class _ForwardTargetSheetState extends ConsumerState<ForwardTargetSheet> {
  final _query = TextEditingController();
  final _picked = <ForwardTarget>[];

  /// Owner 2026-10-21 (inbox 25b, Instagram): people found in the whole
  /// app, without a chat with me yet — their chat is opened on «Send».
  final _people = <String, SuggestedPerson>{};
  bool _opening = false;

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  static String _chatTitle(Conversation c) =>
      c.counterpart.displayName ?? c.counterpart.username ?? c.caseTitle ?? '?';

  bool _matches(String title) {
    final q = _query.text.trim().toLowerCase();
    return q.isEmpty || title.toLowerCase().contains(q);
  }

  int get _count => _picked.length + _people.length;

  void _toggle(ForwardTarget target) => setState(() {
        if (!_picked.remove(target) && _count < kForwardMaxTargets) {
          _picked.add(target);
        }
      });

  void _togglePerson(SuggestedPerson p) => setState(() {
        if (_people.remove(p.id) == null && _count < kForwardMaxTargets) {
          _people[p.id] = p;
        }
      });

  /// Opens (or starts) the chats of the picked people, then pops every
  /// target. A refusal (blocked, privacy) stays on the sheet with a toast.
  Future<void> _send() async {
    if (_opening) return;
    final targets = List<ForwardTarget>.of(_picked);
    if (_people.isNotEmpty) {
      setState(() => _opening = true);
      try {
        final repo = ref.read(chatRepositoryProvider);
        for (final p in _people.values) {
          final conv = await repo.startDirect(p.id);
          final target = ForwardTarget(ForwardTargetKind.conversation, conv.id);
          if (!targets.contains(target)) targets.add(target);
        }
      } on Object catch (e) {
        if (mounted) {
          setState(() => _opening = false);
          showAppSnackBar(context, errorText(ref.read(translatorProvider), e));
        }
        return;
      }
      if (!mounted) return;
    }
    Navigator.of(context).pop(targets);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chatsAsync = ref.watch(conversationsProvider);
    final groupsAsync = ref.watch(groupsProvider);
    final channels = ref.watch(channelsEnabledProvider)
        ? ref
                .watch(
                  channelListProvider(
                    (scope: ChannelScope.managed, query: ''),
                  ),
                )
                .value ??
            const <Channel>[]
        : const <Channel>[];

    final chats = [
      for (final c in chatsAsync.value?.items ?? const <Conversation>[])
        if (_matches(_chatTitle(c)))
          _Row(
            target: ForwardTarget(ForwardTargetKind.conversation, c.id),
            title: _chatTitle(c),
            avatarUrl: c.counterpart.avatarUrl,
            enabled: c.status != ConversationStatus.closed &&
                !(c.request == MessageRequest.declined && c.requestedByMe),
          ),
    ];
    final groups = [
      for (final g in groupsAsync.value?.items ?? const <api.GroupDto>[])
        if (_matches(g.title))
          _Row(
            target: ForwardTarget(ForwardTargetKind.group, g.id),
            title: g.title,
            avatarUrl: g.avatarUrl,
            enabled: g.canPost,
          ),
    ];
    final mine = [
      for (final c in channels)
        if (c.isAdmin && !c.isClosed && _matches(c.title))
          _Row(
            target: ForwardTarget(ForwardTargetKind.channel, c.id),
            title: c.title,
            avatarUrl: c.avatarUrl,
            enabled: true,
          ),
    ];
    final searching =
        peopleSuggestQuery(_query.text).length >= peopleSuggestMinChars;
    final loading = chatsAsync.isLoading && chats.isEmpty && groups.isEmpty;
    final empty = !loading &&
        !searching &&
        chats.isEmpty &&
        groups.isEmpty &&
        mine.isEmpty;

    Widget header(String label) => Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(
            AppSpacing.screenSide,
            AppSpacing.sm,
            AppSpacing.screenSide,
            AppSpacing.xs,
          ),
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.caption.copyWith(
              color: colors.textSecondary,
              fontWeight: FontWeight.w700,
            ),
          ),
        );

    List<Widget> section(String label, List<_Row> rows) => rows.isEmpty
        ? const []
        : [
            header(label),
            for (final r in rows)
              _TargetTile(
                key: ValueKey('forward-${r.target.kind.name}-${r.target.id}'),
                row: r,
                selected: _picked.contains(r.target),
                disabledLabel: t.t('chat.forward.cantPost'),
                onTap: r.enabled ? () => _toggle(r.target) : null,
              ),
          ];

    return SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.78,
        child: Column(
          children: [
            const AppSheetHandle(),
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(
                AppSpacing.screenSide,
                0,
                AppSpacing.screenSide,
                AppSpacing.sm,
              ),
              child: Align(
                alignment: AlignmentDirectional.centerStart,
                child: Text(
                  t.t('chat.forward.title'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.titleMedium.copyWith(color: colors.text),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenSide,
              ),
              child: AppTextField(
                key: const ValueKey('forward-search'),
                controller: _query,
                hintText: t.t('common.search'),
                semanticLabel: t.t('common.search'),
                textInputAction: TextInputAction.search,
                leading: AppIcon(
                  AppIcons.searchRounded,
                  size: 20,
                  color: colors.textSecondary,
                ),
                onChanged: (_) => setState(() {}),
              ),
            ),
            Expanded(
              child: loading
                  ? const Center(child: CircularProgressIndicator())
                  : empty
                      ? AppEmptyState(
                          icon: AppIcons.searchRounded,
                          message: t.t('chat.forward.empty'),
                        )
                      : ListView(
                          key: const ValueKey('forward-list'),
                          padding: const EdgeInsets.only(top: AppSpacing.xs),
                          children: [
                            ...section(t.t('chat.forward.chats'), chats),
                            ...section(t.t('chat.forward.groups'), groups),
                            ...section(t.t('chat.forward.channels'), mine),
                            PeopleSuggestList(
                              key: const ValueKey('forward-people'),
                              query: _query.text,
                              scrollable: false,
                              title: t.t('search.tab.people'),
                              excludeIds: {
                                for (final c in chatsAsync.value?.items ??
                                    const <Conversation>[])
                                  if (c.isDirect && c.counterpart.id != null)
                                    c.counterpart.id!,
                              },
                              selectedIds: _people.keys.toSet(),
                              onPick: _togglePerson,
                            ),
                          ],
                        ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                AppSpacing.sm,
                AppSpacing.screenSide,
                AppSpacing.md,
              ),
              child: AppButton(
                key: const ValueKey('forward-send'),
                label: _count == 0
                    ? t.t('chat.forward.send')
                    : '${t.t('chat.forward.send')} · '
                        '${context.digits(_count)}',
                isLoading: _opening,
                onPressed: _count == 0 ? null : () => unawaited(_send()),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TargetTile extends StatelessWidget {
  const _TargetTile({
    required this.row,
    required this.selected,
    required this.disabledLabel,
    required this.onTap,
    super.key,
  });

  final _Row row;
  final bool selected;
  final String disabledLabel;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final enabled = onTap != null;
    final url = row.avatarUrl;
    return Semantics(
      button: enabled,
      enabled: enabled,
      selected: selected,
      label: enabled ? row.title : '${row.title}, $disabledLabel',
      excludeSemantics: true,
      child: Opacity(
        opacity: enabled ? 1 : 0.45,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(
              AppSpacing.screenSide,
              AppSpacing.xs + 2,
              AppSpacing.screenSide,
              AppSpacing.xs + 2,
            ),
            child: Row(
              children: [
                AppAvatar(
                  initials: avatarInitials(
                    row.title.trim().isEmpty ? '?' : row.title.trim(),
                  ),
                  imageProvider: url == null
                      ? null
                      : appNetworkImage(url, decodeWidthFor(40)),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        row.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.body.copyWith(color: colors.text),
                      ),
                      if (!enabled)
                        Text(
                          disabledLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.caption
                              .copyWith(color: colors.textSecondary),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                AppIcon(
                  selected
                      ? AppIcons.checkCircleRounded
                      : AppIcons.radioButtonUncheckedRounded,
                  size: 22,
                  color: selected ? colors.iconTint : colors.textSecondary,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
