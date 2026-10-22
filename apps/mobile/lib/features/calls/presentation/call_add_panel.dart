import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_group.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';
import 'package:lawbid/shared/people/my_people.dart';

/// Owner 2026-10-22 (WhatsApp «Add participant»): the top-right «add» button
/// of a call opens a full-height panel that slides in from the right (from
/// the left in a right-to-left language) with the people I may call in —
/// my contacts, the people of my accepted chats, then mutual follows (see
/// [myPeopleProvider]); strangers are not listed. A search box filters the
/// list by name or @username. «Invite» (or a tap on the row) adds the
/// person through the call's invite; the panel stays open for the next one.
/// People already in the call (or ringing) say «In call»; a full call (9)
/// says so on top and in every row. The same for a 1:1 and a group call,
/// attorney and client. Closed with ×, the back gesture or a tap outside.
Future<void> showAddToCallPanel(BuildContext context) {
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  return Navigator.of(context, rootNavigator: true).push<void>(
    PageRouteBuilder<void>(
      opaque: false,
      barrierDismissible: true,
      barrierColor: colors.callScrim,
      barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
      transitionDuration: AppMotion.pageEnter,
      reverseTransitionDuration: AppMotion.pageExit,
      pageBuilder: (_, __, ___) => const CallAddPanel(),
      transitionsBuilder: (context, animation, _, child) {
        final rtl = Directionality.of(context) == TextDirection.rtl;
        return SlideTransition(
          position: Tween<Offset>(
            begin: Offset(rtl ? -1 : 1, 0),
            end: Offset.zero,
          ).animate(
            CurvedAnimation(
              parent: animation,
              curve: AppMotion.enterCurve,
              reverseCurve: AppMotion.exitCurve,
            ),
          ),
          child: child,
        );
      },
    ),
  );
}

/// The panel's widest size on a tablet / the web; a phone gets all of it.
const double _panelMaxWidth = 420;

class CallAddPanel extends ConsumerStatefulWidget {
  const CallAddPanel({super.key});

  @override
  ConsumerState<CallAddPanel> createState() => _CallAddPanelState();
}

class _CallAddPanelState extends ConsumerState<CallAddPanel> {
  final _search = TextEditingController();

  /// The person being invited (their row spins).
  String? _inviting;

  /// Invited from here; shown «In call» before the server's update lands.
  final _invited = <String>{};
  String? _error;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  /// Me and everyone in the call or ringing.
  Set<String> _inCall(CallSession session) {
    final call = session.call;
    final me = ref.read(callMyIdProvider);
    return {
      if (me != null) me,
      if (call != null && !call.group && call.channelId == null) call.peer.id,
      for (final m in call?.participants ?? const <CallMember>[])
        if (m.status != CallMemberStatus.left &&
            m.status != CallMemberStatus.declined)
          m.userId,
      ..._invited,
    };
  }

  String _reason(Translator t, String code) {
    final call = ref.read(callControllerProvider).call;
    // Adding a person: the only conflict left is the size of the call.
    if (code == 'CALL_STATE_CONFLICT' && call != null) {
      return t.t('call.fullMax', {'count': context.digits(call.capacity)});
    }
    return callActionError(t, code);
  }

  Future<void> _invite(MyPerson p) async {
    if (_inviting != null) return;
    setState(() {
      _inviting = p.id;
      _error = null;
    });
    final code =
        await ref.read(callControllerProvider.notifier).invite(userId: p.id);
    if (!mounted) return;
    final t = ref.read(translatorProvider);
    setState(() {
      _inviting = null;
      if (code == null) {
        _invited.add(p.id);
      } else {
        _error = _reason(t, code);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final session = ref.watch(callControllerProvider);
    final call = session.call;
    final full = call?.full ?? false;
    final inCall = _inCall(session);
    final people = ref.watch(myPeopleProvider);
    final width = MediaQuery.sizeOf(context).width;

    return Align(
      alignment: AlignmentDirectional.centerEnd,
      child: SizedBox(
        width: math.min(width, _panelMaxWidth),
        height: double.infinity,
        child: Scaffold(
          backgroundColor: colors.bg,
          appBar: AppTopBar(
            leading: AppIconButton(
              key: const ValueKey('call-add-close'),
              icon: AppIcon(AppIcons.closeRounded, color: colors.text),
              semanticLabel:
                  MaterialLocalizations.of(context).closeButtonTooltip,
              onPressed: () => Navigator.of(context).maybePop(),
            ),
            title: Text(t.t('call.addParticipant')),
          ),
          body: SafeArea(
            top: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    AppSpacing.sm,
                    AppSpacing.screenSide,
                    AppSpacing.sm,
                  ),
                  child: AppTextField(
                    key: const ValueKey('call-add-search'),
                    controller: _search,
                    leading: AppIcon(
                      AppIcons.searchRounded,
                      size: AppSizes.iconSm,
                      color: colors.textSecondary,
                    ),
                    hintText: t.t('follow.search.hint'),
                    semanticLabel: t.t('follow.search.hint'),
                    textInputAction: TextInputAction.search,
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                if (full && call != null)
                  _Notice(
                    key: const ValueKey('call-add-full'),
                    text: t.t('call.fullMax', {
                      'count': context.digits(call.capacity),
                    }),
                    color: colors.textSecondary,
                  ),
                if (_error != null)
                  _Notice(
                    key: const ValueKey('call-add-error'),
                    text: _error!,
                    color: colors.dangerText,
                  ),
                Expanded(
                  child: people.when(
                    loading: () => const Center(
                      child: SizedBox.square(
                        dimension: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ),
                    // Each source already swallows its own failure.
                    error: (_, __) => _Empty(text: t.t('call.people.empty')),
                    data: (all) {
                      final found = filterMyPeople(all, _search.text);
                      // Contacts, then chats, then mutual follows.
                      final shown = [
                        for (final g in MyPeopleGroup.values)
                          ...found.where((p) => p.group == g),
                      ];
                      if (shown.isEmpty) {
                        return _Empty(
                          text: all.isEmpty
                              ? t.t('call.people.empty')
                              : t.t('call.people.noMatch'),
                        );
                      }
                      return _PeopleList(
                        people: shown,
                        sectionTitle: (g) => switch (g) {
                          MyPeopleGroup.contacts => t.t('call.people.contacts'),
                          MyPeopleGroup.chats => t.t('call.people.chats'),
                          MyPeopleGroup.mutual => t.t('call.people.mutual'),
                        },
                        rowFor: (p) => _PersonRow(
                          person: p,
                          state: inCall.contains(p.id)
                              ? _RowState.inCall
                              : full
                                  ? _RowState.full
                                  : _inviting == p.id
                                      ? _RowState.busy
                                      : _RowState.open,
                          enabled: _inviting == null,
                          inviteLabel: t.t('call.invite'),
                          inCallLabel: t.t('call.inCall'),
                          fullLabel: t.t('call.full'),
                          onInvite: () => unawaited(_invite(p)),
                        ),
                        headerStyle: type.caption.copyWith(
                          color: colors.textSecondary,
                          fontWeight: FontWeight.w600,
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text, required this.color, super.key});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        0,
        AppSpacing.screenSide,
        AppSpacing.sm,
      ),
      child: Text(text, style: type.body.copyWith(color: color)),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return SingleChildScrollView(
      key: const ValueKey('call-add-empty'),
      padding: const EdgeInsets.all(AppSpacing.xl),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: type.body.copyWith(color: colors.textSecondary),
      ),
    );
  }
}

/// The people with a small heading above each group.
class _PeopleList extends StatelessWidget {
  const _PeopleList({
    required this.people,
    required this.sectionTitle,
    required this.rowFor,
    required this.headerStyle,
  });

  final List<MyPerson> people;
  final String Function(MyPeopleGroup) sectionTitle;
  final Widget Function(MyPerson) rowFor;
  final TextStyle headerStyle;

  @override
  Widget build(BuildContext context) {
    final items = <Object>[];
    MyPeopleGroup? last;
    for (final p in people) {
      if (p.group != last) {
        items.add(p.group);
        last = p.group;
      }
      items.add(p);
    }
    return ListView.builder(
      key: const ValueKey('call-add-list'),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      itemCount: items.length,
      itemBuilder: (context, i) {
        final item = items[i];
        if (item is MyPeopleGroup) {
          return Padding(
            key: ValueKey('call-add-section-${item.name}'),
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              AppSpacing.md,
              AppSpacing.screenSide,
              AppSpacing.xs,
            ),
            child: Semantics(
              header: true,
              child: Text(sectionTitle(item), style: headerStyle),
            ),
          );
        }
        return rowFor(item as MyPerson);
      },
    );
  }
}

enum _RowState { open, busy, inCall, full }

class _PersonRow extends StatelessWidget {
  const _PersonRow({
    required this.person,
    required this.state,
    required this.enabled,
    required this.inviteLabel,
    required this.inCallLabel,
    required this.fullLabel,
    required this.onInvite,
  });

  final MyPerson person;
  final _RowState state;

  /// false while another person is being invited.
  final bool enabled;
  final String inviteLabel;
  final String inCallLabel;
  final String fullLabel;
  final VoidCallback onInvite;

  static const double _avatar = 44;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final url = person.avatarUrl;
    final handle = person.username.isEmpty ? '' : atHandle(person.username);
    final showHandle = person.name.isNotEmpty && handle.isNotEmpty;
    final open = state == _RowState.open;
    final canTap = open && enabled;
    final status = switch (state) {
      _RowState.inCall => inCallLabel,
      _RowState.full => fullLabel,
      _ => inviteLabel,
    };
    return Semantics(
      button: open,
      enabled: canTap,
      label: [
        person.title,
        if (showHandle) handle,
        status,
      ].join(', '),
      excludeSemantics: true,
      child: InkWell(
        key: ValueKey('call-add-row-${person.id}'),
        onTap: canTap ? onInvite : null,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.hitTarget),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenSide,
              vertical: AppSpacing.sm,
            ),
            child: Opacity(
              opacity: open ? 1 : 0.6,
              child: Row(
                children: [
                  AppAvatar(
                    size: _avatar,
                    initials: avatarInitials(
                      person.name.isNotEmpty ? person.name : person.username,
                    ),
                    imageProvider: url == null || url.isEmpty
                        ? null
                        : appNetworkImage(url, decodeWidthFor(_avatar)),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          person.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.body.copyWith(
                            color: colors.text,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        if (showHandle)
                          Text(
                            handle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.caption
                                .copyWith(color: colors.textSecondary),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 128),
                    child: switch (state) {
                      _RowState.busy => const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      _RowState.open => DecoratedBox(
                          key: ValueKey('call-add-invite-${person.id}'),
                          decoration: BoxDecoration(
                            color: enabled ? colors.accent : colors.chip,
                            borderRadius: BorderRadius.circular(AppRadii.pill),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: AppSpacing.md,
                              vertical: AppSpacing.xs + 2,
                            ),
                            child: Text(
                              inviteLabel,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: type.caption.copyWith(
                                color: enabled
                                    ? colors.onAccent
                                    : colors.textSecondary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                      _ => Text(
                          status,
                          key: ValueKey('call-add-state-${person.id}'),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.end,
                          style: type.caption
                              .copyWith(color: colors.textSecondary),
                        ),
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
