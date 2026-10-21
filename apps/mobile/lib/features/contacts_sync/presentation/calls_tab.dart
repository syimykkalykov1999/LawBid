import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_history_providers.dart';
import 'package:lawbid/features/calls/domain/call_history_models.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/contact_info_screen.dart';
import 'package:lawbid/features/chat/presentation/open_direct_chat.dart';
import 'package:lawbid/features/contacts_sync/presentation/contact_rows.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

/// Owner 2026-10-21: «Contacts | Calls» — the two sections of the screen the
/// «+» of the chats opens, a compact segmented switch under the top bar.
class ContactsCallsSegment extends StatelessWidget {
  const ContactsCallsSegment({
    required this.calls,
    required this.contactsLabel,
    required this.callsLabel,
    required this.onChanged,
    super.key,
  });

  /// The «Calls» section is shown.
  final bool calls;
  final String contactsLabel;
  final String callsLabel;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget tab(String label, {required bool on, required bool isCalls}) {
      return Expanded(
        child: Semantics(
          button: true,
          selected: on,
          label: label,
          excludeSemantics: true,
          child: AppPressable(
            onTap: () => onChanged(isCalls),
            child: Container(
              constraints: const BoxConstraints(minHeight: 36),
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
              decoration: BoxDecoration(
                color: on ? colors.surface : null,
                borderRadius: BorderRadius.circular(AppRadii.pill),
                border: on ? Border.all(color: colors.gold) : null,
              ),
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.bodySmall.copyWith(
                  color: on ? colors.text : colors.textSecondary,
                  fontWeight: on ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.sm,
        AppSpacing.screenSide,
        0,
      ),
      child: Container(
        padding: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: colors.chip,
          borderRadius: BorderRadius.circular(AppRadii.pill),
        ),
        child: Row(
          children: [
            tab(contactsLabel, on: !calls, isCalls: false),
            tab(callsLabel, on: calls, isCalls: true),
          ],
        ),
      ),
    );
  }
}

/// «Calls» (WhatsApp): the group calls running now with «Join» / «Return»,
/// then the history — repeats folded into one line with a counter, the
/// next page loads at the end of the list.
class CallsTab extends ConsumerStatefulWidget {
  const CallsTab({super.key});

  @override
  ConsumerState<CallsTab> createState() => _CallsTabState();
}

class _CallsTabState extends ConsumerState<CallsTab> {
  final _scroll = ScrollController();
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_nearEnd);
    // A call may start while the tab is open: read the running ones again.
    _poll = Timer.periodic(const Duration(seconds: 15), (_) {
      if (mounted) ref.invalidate(ongoingGroupCallsProvider);
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _scroll
      ..removeListener(_nearEnd)
      ..dispose();
    super.dispose();
  }

  void _nearEnd() {
    if (!_scroll.hasClients) return;
    if (_scroll.position.extentAfter < 400) {
      unawaited(ref.read(callHistoryProvider.notifier).loadMore());
    }
  }

  Future<void> _refresh() async {
    ref.invalidate(ongoingGroupCallsProvider);
    await ref.read(callHistoryProvider.notifier).refresh();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final history = ref.watch(callHistoryProvider);
    final ongoing = ref.watch(ongoingGroupCallsProvider).value ?? const [];
    return history.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => AppEmptyState(
        icon: AppIcons.callOutlined,
        message: errorText(t, e),
        action: AppButton(
          label: t.t('common.retry'),
          onPressed: () => ref.invalidate(callHistoryProvider),
        ),
      ),
      data: (list) {
        final groups = groupCallHistory(list.items);
        if (groups.isEmpty && ongoing.isEmpty) {
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                SizedBox(
                  height: 320,
                  child: AppEmptyState(
                    icon: AppIcons.callOutlined,
                    message: t.t('calls.empty'),
                  ),
                ),
              ],
            ),
          );
        }
        final bottom = AppSpacing.xxl + MediaQuery.paddingOf(context).bottom;
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            controller: _scroll,
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.only(bottom: bottom),
            children: [
              if (ongoing.isNotEmpty) ...[
                ContactsSectionTitle(t.t('call.ongoing')),
                for (final c in ongoing)
                  OngoingCallRow(key: ValueKey('ongoing-${c.id}'), call: c),
              ],
              if (groups.isNotEmpty) ContactsSectionTitle(t.t('calls.recent')),
              for (final g in groups)
                CallHistoryRow(key: ValueKey('call-${g.latest.id}'), group: g),
              if (list.isLoadingMore)
                const Padding(
                  padding: EdgeInsets.all(AppSpacing.lg),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (list.loadMoreError != null)
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: AppButton(
                    label: t.t('common.retry'),
                    variant: AppButtonVariant.secondary,
                    onPressed: () => unawaited(
                      ref.read(callHistoryProvider.notifier).retryLoadMore(),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

/// A group call running now: «Join» (or «Return» when I am in it).
class OngoingCallRow extends ConsumerStatefulWidget {
  const OngoingCallRow({required this.call, super.key});

  final OngoingGroupCall call;

  @override
  ConsumerState<OngoingCallRow> createState() => _OngoingCallRowState();
}

class _OngoingCallRowState extends ConsumerState<OngoingCallRow> {
  bool _busy = false;

  Future<void> _join() async {
    if (_busy) return;
    setState(() => _busy = true);
    final t = ref.read(translatorProvider);
    try {
      final code = await ref.read(joinOngoingGroupCallProvider)(widget.call);
      if (code != null && mounted) {
        showAppSnackBar(
          context,
          t.t(code == kMicDenied ? 'call.micDenied' : 'error.default.message'),
        );
      }
    } on Object {
      if (mounted) showAppSnackBar(context, t.t('error.default.message'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.call;
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return _CallRowShell(
      onTap: _join,
      avatar: GoldRingAvatar(
        url: c.groupAvatarUrl,
        initials: avatarInitials(c.groupTitle),
        size: 44,
      ),
      title: c.groupTitle,
      subtitle: Row(
        children: [
          AppIcon(
            c.video ? AppIcons.videoCameraOutlined : AppIcons.callOutlined,
            size: 14,
            color: colors.success,
          ),
          const SizedBox(width: AppSpacing.xs),
          Flexible(
            child: _Sub('${t.t('call.members')} · ${f.digits(c.joined)}'),
          ),
        ],
      ),
      // AppButton is full-width: bound it, a long label wraps inside.
      trailing: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 124),
        child: AppButton(
          key: ValueKey(c.mine ? 'ongoing-return' : 'ongoing-join'),
          label: t.t(c.mine ? 'calls.return' : 'group.call.join'),
          variant:
              c.mine ? AppButtonVariant.secondary : AppButtonVariant.primary,
          isLoading: _busy,
          onPressed: _join,
        ),
      ),
    );
  }
}

/// One line of the history. Tap = call back (the same sort: audio / video);
/// a group's line opens the group chat.
class CallHistoryRow extends ConsumerWidget {
  const CallHistoryRow({required this.group, super.key});

  final CallHistoryGroup group;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final e = group.latest;
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final video = ref.watch(videoCallsEnabledProvider);
    final missed = e.kind == CallHistoryKind.missed;
    final name = e.isGroup ? (e.groupTitle ?? e.peer.name) : e.peer.name;
    final title = group.count > 1 ? '$name (${f.digits(group.count)})' : name;
    final icon = switch (e.kind) {
      CallHistoryKind.outgoing => AppIcons.callMadeRounded,
      CallHistoryKind.incoming => AppIcons.callReceivedRounded,
      CallHistoryKind.missed => AppIcons.callMissedRounded,
    };
    final iconColor = missed ? colors.dangerText : colors.textSecondary;
    final when = _when(t, f, e.createdAt);
    final talk = e.durationSec != null && e.durationSec! > 0
        ? ' · ${_duration(f, e.durationSec!)}'
        : '';
    return _CallRowShell(
      onTap: () => _callBack(context, ref, e, video: e.video),
      avatar: GoldRingAvatar(
        url: e.isGroup ? e.groupAvatarUrl : e.peer.avatarUrl,
        initials: avatarInitials(name),
        size: 44,
      ),
      title: title,
      titleColor: missed ? colors.dangerText : null,
      subtitle: Row(
        children: [
          AppIcon(icon, size: 14, color: iconColor),
          const SizedBox(width: AppSpacing.xs),
          Flexible(child: _Sub('$when$talk')),
        ],
      ),
      trailing: e.isGroup
          ? null
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                ContactActionButton(
                  icon: AppIcons.callOutlined,
                  label: t.t('call.button'),
                  onPressed: () => _callBack(context, ref, e, video: false),
                ),
                if (video)
                  ContactActionButton(
                    icon: AppIcons.videoCameraOutlined,
                    label: t.t('call.videoButton'),
                    onPressed: () => _callBack(context, ref, e, video: true),
                  ),
              ],
            ),
    );
  }

  static String _duration(L10nFormats f, int sec) {
    final m = sec ~/ 60;
    final s = (sec % 60).toString().padLeft(2, '0');
    return f.digits('$m:$s');
  }

  static String _when(Translator t, L10nFormats f, DateTime at) {
    final local = at.toLocal();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(local.year, local.month, local.day);
    final days = today.difference(day).inDays;
    if (days <= 0) return f.time(local);
    if (days == 1) return t.t('chat.yesterday');
    return f.date(local);
  }

  /// Like the contacts list: the chat decides whether a call is allowed.
  Future<void> _callBack(
    BuildContext context,
    WidgetRef ref,
    CallHistoryEntry e, {
    required bool video,
  }) async {
    final t = ref.read(translatorProvider);
    if (e.isGroup) {
      // The group chat has the call buttons (and the running call's banner).
      // A literal path: the groups feature stays out of this one's imports.
      unawaited(HapticFeedback.selectionClick());
      await context.push('/group/${Uri.encodeComponent(e.groupId!)}');
      return;
    }
    try {
      final all = await ref.read(conversationsProvider.future);
      Conversation? conv;
      for (final c in all.items) {
        if (c.id == e.conversationId ||
            (c.isDirect && c.counterpart.id == e.peer.id)) {
          conv = c;
          if (c.id == e.conversationId) break;
        }
      }
      if (conv == null || !chatAudioCallAllowed(ref, conv)) {
        if (context.mounted) {
          showAppSnackBar(context, t.t('call.notAllowedRequest'));
          if (conv == null) await openDirectChat(context, ref, e.peer.id);
        }
        return;
      }
      await HapticFeedback.mediumImpact();
      await ref.read(callControllerProvider.notifier).call(
            conv.id,
            peer: e.peer,
            video: video,
          );
    } on Object {
      if (context.mounted) {
        showAppSnackBar(context, t.t('error.default.message'));
      }
    }
  }
}

class _Sub extends StatelessWidget {
  const _Sub(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Text(
      text,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: type.caption.copyWith(color: colors.textSecondary),
    );
  }
}

/// Avatar · title + subtitle · trailing — the same size as a contact row.
class _CallRowShell extends StatelessWidget {
  const _CallRowShell({
    required this.avatar,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.titleColor,
    this.trailing,
  });

  final Widget avatar;
  final String title;
  final Color? titleColor;
  final Widget subtitle;
  final Widget? trailing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenSide,
          vertical: AppSpacing.sm,
        ),
        child: Row(
          children: [
            avatar,
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.body.copyWith(
                      color: titleColor ?? colors.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  subtitle,
                ],
              ),
            ),
            if (trailing != null) ...[
              const SizedBox(width: AppSpacing.sm),
              trailing!,
            ],
          ],
        ),
      ),
    );
  }
}
