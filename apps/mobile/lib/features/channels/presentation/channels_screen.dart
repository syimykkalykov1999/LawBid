import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/channels_routes.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channel_widgets.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Owner 2026-10-20: the channels screen — the ones I run, the ones I
/// follow, and discover / search (title or @username).
class ChannelsScreen extends ConsumerStatefulWidget {
  const ChannelsScreen({super.key});

  @override
  ConsumerState<ChannelsScreen> createState() => _ChannelsScreenState();
}

class _ChannelsScreenState extends ConsumerState<ChannelsScreen> {
  ChannelScope _tab = ChannelScope.subscribed;
  String _query = '';
  final _text = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _text.dispose();
    super.dispose();
  }

  void _typed(String raw) {
    _debounce?.cancel();
    final v = raw.trim();
    if (v.isEmpty) {
      setState(() => _query = '');
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (mounted) setState(() => _query = v);
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final canCreate = ref.watch(currentUserRoleProvider) == UserRole.attorney;
    final searching = _query.isNotEmpty;
    final scope = searching ? ChannelScope.discover : _tab;
    final key = (scope: scope, query: searching ? _query : '');
    final list = ref.watch(channelListProvider(key));

    Future<void> refresh() async {
      ref.invalidate(channelListProvider(key));
      await ref.read(channelListProvider(key).future);
    }

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
          title: Text(t.t('channel.title')),
          actions: [
            if (canCreate)
              AppIconButton(
                key: const ValueKey('channels-create'),
                icon: AppIcon(AppIcons.addRounded, color: colors.text),
                semanticLabel: t.t('channel.create'),
                onPressed: () => context.push(ChannelsRoutes.newChannel),
              ),
          ],
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                AppSpacing.sm,
                AppSpacing.screenSide,
                0,
              ),
              child: AppTextField(
                key: const ValueKey('channels-search'),
                controller: _text,
                hintText: t.t('channel.search.hint'),
                semanticLabel: t.t('channel.search.hint'),
                leading: AppIcon(
                  AppIcons.searchRounded,
                  color: colors.textSecondary,
                ),
                textInputAction: TextInputAction.search,
                onChanged: _typed,
              ),
            ),
            if (!searching)
              PillTabs<ChannelScope>(
                value: _tab,
                tabs: [
                  (ChannelScope.managed, t.t('channel.tab.mine')),
                  (ChannelScope.subscribed, t.t('channel.tab.subscribed')),
                  (ChannelScope.discover, t.t('channel.tab.discover')),
                ],
                onChanged: (v) => setState(() => _tab = v),
              ),
            Expanded(
              child: switch (list) {
                AsyncData(:final value) when value.isEmpty =>
                  _empty(t, searching, canCreate),
                AsyncData(:final value) => RefreshIndicator(
                    color: colors.gold,
                    backgroundColor: colors.sheet,
                    onRefresh: refresh,
                    child: ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.only(
                        top: AppSpacing.sm,
                        bottom: AppSpacing.xxl,
                      ),
                      itemCount: value.length,
                      separatorBuilder: (_, __) =>
                          const SizedBox(height: AppSpacing.xs),
                      itemBuilder: (context, i) => ChannelRow(
                        key: ValueKey('channel-row-${value[i].id}'),
                        channel: value[i],
                        onTap: () => context.push(
                          ChannelsRoutes.channel(value[i].id),
                        ),
                      ),
                    ),
                  ),
                AsyncError(:final error) => CasesErrorView(
                    error: error,
                    t: t,
                    onRetry: () => ref.invalidate(channelListProvider(key)),
                  ),
                _ => const CasesListSkeleton(),
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _empty(Translator t, bool searching, bool canCreate) {
    if (searching) {
      return ChannelsEmpty(
        icon: AppIcons.searchOffRounded,
        message: t.t('channel.empty.search'),
      );
    }
    return switch (_tab) {
      ChannelScope.managed => ChannelsEmpty(
          title: t.t('channel.empty.mine.title'),
          message: t.t('channel.empty.mine'),
          action: canCreate
              ? AppButton(
                  label: t.t('channel.create'),
                  onPressed: () => context.push(ChannelsRoutes.newChannel),
                )
              : null,
        ),
      ChannelScope.subscribed => ChannelsEmpty(
          title: t.t('channel.empty.subscribed.title'),
          message: t.t('channel.empty.subscribed'),
          action: AppButton(
            label: t.t('channel.tab.discover'),
            variant: AppButtonVariant.secondary,
            onPressed: () => setState(() => _tab = ChannelScope.discover),
          ),
        ),
      _ => ChannelsEmpty(message: t.t('channel.empty.discover')),
    };
  }
}
