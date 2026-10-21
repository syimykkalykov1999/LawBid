import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/channels_routes.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channel_actions.dart';
import 'package:lawbid/features/channels/presentation/channel_post_card.dart';
import 'package:lawbid/features/channels/presentation/channel_widgets.dart';
import 'package:lawbid/features/groups/application/group_call_port.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_call_ui.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart'
    show VerifiedCheck;
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';

/// Owner 2026-10-20: a channel — header, subscribe / mute / share, ⋯ menu
/// and the posts feed (newest first). [channelRef] is the id or @username;
/// [focusPostId] puts one shared post first.
class ChannelScreen extends ConsumerStatefulWidget {
  const ChannelScreen({required this.channelRef, this.focusPostId, super.key});

  final String channelRef;
  final String? focusPostId;

  @override
  ConsumerState<ChannelScreen> createState() => _ChannelScreenState();
}

class _ChannelScreenState extends ConsumerState<ChannelScreen> {
  String? _focusedFor;
  Timer? _callTimer;

  @override
  void initState() {
    super.initState();
    // Inbox 20e: a channel may have thousands of subscribers, so nobody is
    // told about its call — the open channel asks every 10 s instead.
    _callTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      final id = ref.read(channelProvider(widget.channelRef)).value?.id;
      if (mounted && id != null) {
        ref.invalidate(channelRunningCallProvider(id));
      }
    });
  }

  @override
  void dispose() {
    _callTimer?.cancel();
    super.dispose();
  }

  /// The phone / video button (owner and admins): starts the channel's call.
  Future<void> _startCall(Channel channel, {required bool video}) async {
    final start = ref.read(groupCallPortProvider)?.startChannel;
    if (start == null) return;
    final code = await start(
      channel.id,
      title: channel.title,
      avatarUrl: channel.avatarUrl,
      video: video,
    );
    _callChanged(channel, code);
  }

  Future<void> _joinCall(Channel channel, GroupRunningCall running) async {
    final code = await running.join(channel.title, channel.avatarUrl);
    _callChanged(channel, code);
  }

  void _callChanged(Channel channel, String? code) {
    if (!mounted) return;
    if (code != null) {
      showAppSnackBar(
        context,
        groupCallError(
          ref.read(translatorProvider),
          code,
          max: context.digits(groupCallMax),
        ),
      );
    }
    ref
      ..invalidate(channelRunningCallProvider(channel.id))
      ..invalidate(channelListProvider);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final channel = ref.watch(channelProvider(widget.channelRef));
    final value = channel.value;
    final canStart = value != null &&
        value.isAdmin &&
        ref.watch(groupCallPortProvider)?.startChannel != null;
    final live = value == null || !(value.isAdmin || value.isSubscribed)
        ? null
        : channelRunningCallProvider(value.id);
    final running = live == null ? null : ref.watch(live).value;

    return ChannelsGate(
      child: Scaffold(
        backgroundColor: colors.bg,
        appBar: AppTopBar(
          leading: AppBackButton(
            semanticLabel: t.t('common.back'),
            onPressed: () => context.canPop()
                ? context.pop()
                : Navigator.of(context).maybePop(),
          ),
          title: Text(channel.value?.title ?? t.t('channel.title')),
          actions: [
            // Owner 2026-10-21 (inbox 20e, Telegram): the channel's video
            // chat — owner and admins start it, subscribers join.
            if (canStart) ...[
              if (ref.watch(groupVideoCallsProvider))
                AppIconButton(
                  key: const ValueKey('channel-video-call'),
                  icon: AppIcon(
                    AppIcons.videoCameraOutlined,
                    size: 22,
                    color: colors.text,
                  ),
                  semanticLabel: t.t('call.videoButton'),
                  onPressed: () => _startCall(value, video: true),
                ),
              AppIconButton(
                key: const ValueKey('channel-audio-call'),
                icon: AppIcon(
                  AppIcons.callOutlined,
                  size: 22,
                  color: colors.text,
                ),
                semanticLabel: t.t('call.button'),
                onPressed: () => _startCall(value, video: false),
              ),
            ],
            if (channel.value != null)
              AppIconButton(
                key: const ValueKey('channel-menu'),
                icon: AppIcon(AppIcons.moreVertRounded, color: colors.text),
                semanticLabel: t.t('channel.menu'),
                onPressed: () => _menu(context, channel.value!),
              ),
          ],
        ),
        body: Column(
          children: [
            if (value != null && running != null)
              GroupCallJoinBar(
                running: running,
                live: live,
                onJoin: () => _joinCall(value, running),
              ),
            Expanded(
              child: switch (channel) {
                AsyncData(:final value) => _Feed(
                    channel: value,
                    channelRef: widget.channelRef,
                    focusPostId: widget.focusPostId,
                    onFocusStarted: () => _focusedFor = value.id,
                    alreadyFocused: _focusedFor == value.id,
                  ),
                AsyncError(:final error) => CasesErrorView(
                    error: error,
                    t: t,
                    onRetry: () =>
                        ref.invalidate(channelProvider(widget.channelRef)),
                  ),
                _ => const DetailSkeleton(),
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _menu(BuildContext context, Channel channel) async {
    final t = ref.read(translatorProvider);
    await showAppBottomSheet<void>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            AppListRow(
              icon: AppIcons.iosShareRounded,
              label: t.t('channel.share'),
              showChevron: false,
              onTap: () {
                Navigator.of(sheet).pop();
                shareChannel(context, ref, channel);
              },
            ),
            if (channel.isAdmin)
              AppListRow(
                key: const ValueKey('channel-menu-edit'),
                icon: AppIcons.editOutlined,
                label: t.t('channel.edit'),
                showChevron: false,
                onTap: () {
                  Navigator.of(sheet).pop();
                  context.push(ChannelsRoutes.edit(channel.id));
                },
              ),
            if (channel.isOwner)
              AppListRow(
                key: const ValueKey('channel-menu-admins'),
                icon: AppIcons.manageAccountsOutlined,
                label: t.t('channel.admins'),
                showChevron: false,
                onTap: () {
                  Navigator.of(sheet).pop();
                  context.push(ChannelsRoutes.admins(channel.id));
                },
              ),
            if (!channel.isAdmin)
              AppListRow(
                key: const ValueKey('channel-menu-report'),
                icon: AppIcons.flagOutlined,
                label: t.t('post.menu.report'),
                showChevron: false,
                onTap: () {
                  Navigator.of(sheet).pop();
                  showChannelReportSheet(
                    context,
                    ref,
                    targetId: channel.id,
                  );
                },
              ),
            if (channel.isOwner)
              AppListRow(
                key: const ValueKey('channel-menu-delete'),
                icon: AppIcons.deleteOutlineRounded,
                label: t.t('channel.delete'),
                destructive: true,
                showChevron: false,
                onTap: () {
                  Navigator.of(sheet).pop();
                  _delete(context, channel);
                },
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _delete(BuildContext context, Channel channel) async {
    final t = ref.read(translatorProvider);
    final ok = await confirmChannelAction(
      context,
      ref,
      title: t.t('channel.delete.title'),
      message: t.t('channel.delete.message', {'title': channel.title}),
      confirmLabel: t.t('channel.delete'),
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(channelsRepositoryProvider).delete(channel.id);
      ref.invalidate(channelListProvider);
      if (context.mounted) context.go(ChannelsRoutes.list);
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, channelErrorText(t, e));
    }
  }
}

class _Feed extends ConsumerStatefulWidget {
  const _Feed({
    required this.channel,
    required this.channelRef,
    required this.focusPostId,
    required this.onFocusStarted,
    required this.alreadyFocused,
  });

  final Channel channel;
  final String channelRef;
  final String? focusPostId;
  final VoidCallback onFocusStarted;
  final bool alreadyFocused;

  @override
  ConsumerState<_Feed> createState() => _FeedState();
}

class _FeedState extends ConsumerState<_Feed> {
  @override
  void initState() {
    super.initState();
    final focus = widget.focusPostId;
    if (focus != null && !widget.alreadyFocused) {
      widget.onFocusStarted();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ref
            .read(channelPostsProvider(widget.channel.id).notifier)
            .focus(focus)
            .ignore();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final channel = widget.channel;
    final posts = ref.watch(channelPostsProvider(channel.id));
    final notifier = ref.read(channelPostsProvider(channel.id).notifier);
    return PagedListBody<ChannelPost>(
      value: posts,
      t: t,
      itemKey: (p) => p.id,
      header: ChannelHeader(channel: channel, channelRef: widget.channelRef),
      empty: ChannelsEmpty(
        title: t.t('channel.empty.posts.title'),
        message: channel.isAdmin
            ? t.t('channel.empty.posts.admin')
            : t.t('channel.empty.posts'),
        icon: AppIcons.articleOutlined,
      ),
      onRefresh: () async {
        await notifier.refresh();
        ref.invalidate(channelProvider(widget.channelRef));
      },
      onLoadMore: notifier.loadMore,
      onRetryMore: notifier.retryLoadMore,
      itemBuilder: (context, post, _) =>
          ChannelPostCard(channel: channel, post: post),
    );
  }
}

/// Avatar, title, @username, description, counters and the buttons: Subscribe
/// / Unsubscribe, Mute, Share, and for the admins New post.
class ChannelHeader extends ConsumerStatefulWidget {
  const ChannelHeader({
    required this.channel,
    required this.channelRef,
    super.key,
  });

  final Channel channel;

  /// What the screen opened the channel by (its id or @username): the
  /// buttons change that very state.
  final String channelRef;

  @override
  ConsumerState<ChannelHeader> createState() => _ChannelHeaderState();
}

class _ChannelHeaderState extends ConsumerState<ChannelHeader> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await action();
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, channelErrorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final channel = widget.channel;
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final controller = ref.read(channelProvider(widget.channelRef).notifier);
    final description = channel.description;
    final subscribers = SocialFormat.plural(
      t,
      f,
      'channel.subscribers',
      channel.subscriberCount,
    );
    final posts = SocialFormat.plural(t, f, 'channel.posts', channel.postCount);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: AppSpacing.sm),
        // Owner 2026-10-20: a row like a chat — the picture on the left, the
        // name, @username and the counters beside it.
        Row(
          children: [
            GestureDetector(
              key: const ValueKey('channel-header-avatar'),
              onTap: channel.avatarUrl == null
                  ? null
                  : () => showPhotoGallery(
                        context,
                        urls: [channel.avatarFullUrl ?? channel.avatarUrl!],
                        closeLabel: t.t('common.close'),
                      ),
              child: ChannelAvatar(
                title: channel.title,
                url: channel.avatarUrl,
                size: 56,
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    channel.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: type.titleMedium.copyWith(color: colors.text),
                  ),
                  Text(
                    '@${channel.username}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                  Text(
                    '$subscribers · $posts',
                    key: const ValueKey('channel-counters'),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: AppSpacing.xs,
          children: [
            Text(
              t.t('channel.by', {'name': channel.owner.name}),
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
            if (channel.owner.verified)
              VerifiedCheck(
                label: t.t('post.verified'),
                size: 15,
                gold: true,
              ),
          ],
        ),
        if (description != null && description.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          ChannelLinkedText(
            text: description,
            style: type.bodySmall,
            collapsedLines: 6,
          ),
        ],
        if (channel.isClosed) ...[
          const SizedBox(height: AppSpacing.md),
          Container(
            key: const ValueKey('channel-closed'),
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: colors.dangerTint,
              borderRadius: BorderRadius.circular(AppRadii.field),
            ),
            child: Text(
              t.t('channel.closed'),
              style: type.bodySmall.copyWith(color: colors.dangerText),
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.md),
        Row(
          children: [
            Expanded(
              child: channel.isAdmin
                  ? AppButton(
                      key: const ValueKey('channel-new-post'),
                      label: t.t('channel.newPost'),
                      icon: AppIcons.editNoteRounded,
                      height: AppSizes.touchTarget,
                      isEnabled: !channel.isClosed,
                      onPressed: () =>
                          context.push(ChannelsRoutes.compose(channel.id)),
                    )
                  : channel.isSubscribed
                      ? AppButton(
                          key: const ValueKey('channel-unsubscribe'),
                          label: t.t('channel.unsubscribe'),
                          variant: AppButtonVariant.secondary,
                          height: AppSizes.touchTarget,
                          isLoading: _busy,
                          onPressed: () => _run(
                            () => controller.setSubscribed(on: false),
                          ),
                        )
                      : AppButton(
                          key: const ValueKey('channel-subscribe'),
                          label: t.t('channel.subscribe'),
                          height: AppSizes.touchTarget,
                          isLoading: _busy,
                          onPressed: () => _run(
                            () => controller.setSubscribed(on: true),
                          ),
                        ),
            ),
            if (channel.isSubscribed) ...[
              const SizedBox(width: AppSpacing.sm),
              AppIconButton(
                key: const ValueKey('channel-mute'),
                plain: false,
                icon: AppIcon(
                  channel.isMuted
                      ? AppIcons.notificationsOffOutlined
                      : AppIcons.notificationsRounded,
                  color: colors.text,
                ),
                semanticLabel: channel.isMuted
                    ? t.t('channel.unmute')
                    : t.t('channel.mute'),
                onPressed: () => _run(
                  () => controller.setMuted(muted: !channel.isMuted),
                ),
              ),
            ],
            const SizedBox(width: AppSpacing.sm),
            AppIconButton(
              key: const ValueKey('channel-share'),
              plain: false,
              icon: AppIcon(AppIcons.iosShareRounded, color: colors.text),
              semanticLabel: t.t('channel.share'),
              onPressed: () => shareChannel(context, ref, channel),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
      ],
    );
  }
}
