import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_history_providers.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/contact_info_screen.dart';
import 'package:lawbid/features/chat/presentation/open_direct_chat.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_background_sync.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_sync_providers.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/contacts_sync/presentation/calls_tab.dart';
import 'package:lawbid/features/contacts_sync/presentation/contact_rows.dart';
import 'package:lawbid/features/contacts_sync/presentation/contacts_section.dart';
import 'package:lawbid/features/contacts_sync/presentation/contacts_states.dart';
import 'package:lawbid/features/contacts_sync/presentation/invite_contact.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:lawbid/shared/people/people_suggest_list.dart';

/// Owner 2026-10-20: "Contacts" like WhatsApp — the phone-book people who
/// are on LawBid (with message / call / video) and the rest to invite.
/// A browser cannot read the phone book: "Available in the app".
///
/// Owner 2026-10-21: two sections under a segmented switch — «Contacts» and
/// «Calls» (history and the group calls running now, like WhatsApp).
class ContactsScreen extends ConsumerStatefulWidget {
  const ContactsScreen({this.initialCalls = false, super.key});

  /// Opens on the «Calls» section.
  final bool initialCalls;

  @override
  ConsumerState<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends ConsumerState<ContactsScreen> {
  late bool _calls = widget.initialCalls;
  late final PageController _pages =
      PageController(initialPage: _calls ? 1 : 0);

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  /// A tap on the segment slides to the section; a swipe lands here too.
  void _show(bool calls, {bool slide = true}) {
    if (calls == _calls) return;
    ref.read(callLogSelectionProvider.notifier).stop();
    setState(() => _calls = calls);
    if (!slide || !_pages.hasClients) return;
    if (context.reduceMotion) {
      _pages.jumpToPage(calls ? 1 : 0);
    } else {
      unawaited(
        _pages.animateToPage(
          calls ? 1 : 0,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOutCubic,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final picked = ref.watch(callLogSelectionProvider);
    // Owner 2026-10-21: the segment sits small in the middle of the top bar
    // (Telegram); a slot on the right keeps it centred on both sections.
    final bar = picked != null
        ? CallLogSelectionBar(picked: picked)
        : AppTopBar(
            leading: AppBackButton(
              semanticLabel: t.t('common.back'),
              onPressed: () => Navigator.of(context).maybePop(),
            ),
            title: ContactsCallsSegment(
              calls: _calls,
              contactsLabel: t.t('phoneContacts.title'),
              callsLabel: t.t('calls.title'),
              onChanged: _show,
            ),
            actions: [
              if (_calls)
                const CallLogMenuButton()
              else
                const SizedBox(width: AppSizes.hitTarget),
            ],
          );
    return PopScope(
      // Back first ends picking (WhatsApp).
      canPop: picked == null,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) ref.read(callLogSelectionProvider.notifier).stop();
      },
      child: Scaffold(
        backgroundColor: colors.bg,
        appBar: bar,
        // Owner 2026-10-21: the two sections slide like the other tabs of
        // the app (the same on Android and iOS).
        body: PageView(
          controller: _pages,
          onPageChanged: (i) => _show(i == 1, slide: false),
          children: [
            if (kIsWeb)
              AppEmptyState(
                icon: AppIcons.contactPhoneOutlined,
                message: t.t('phoneContacts.webOnly'),
              )
            else
              _Body(t: t),
            const CallsTab(),
          ],
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.t});

  final Translator t;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final contacts = ref.watch(phoneContactsProvider);
    return contacts.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, __) => AppEmptyState(
        icon: AppIcons.contactPhoneOutlined,
        message: t.t('error.default.message'),
        action: AppButton(
          label: t.t('common.retry'),
          onPressed: () => ref.invalidate(phoneContactsProvider),
        ),
      ),
      data: (data) {
        if (data.needsConsent) return const ContactsConsentView();
        if (data.denied) return const ContactsDeniedView();
        bool hit(String name, [String? handle]) =>
            _query.isEmpty ||
            name.toLowerCase().contains(_query) ||
            (handle ?? '').toLowerCase().contains(_query);
        final onLawBid = [
          for (final c in data.onLawBid)
            if (hit(c.title, c.person.username)) c,
        ];
        final invite = [
          for (final c in data.invite)
            if (hit(c.name)) c,
        ];
        final bottom = AppSpacing.xxl + MediaQuery.paddingOf(context).bottom;
        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(phoneContactsProvider);
            await ref.read(phoneContactsProvider.future);
          },
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    AppSpacing.sm,
                    AppSpacing.screenSide,
                    0,
                  ),
                  child: AppTextField(
                    leading: const AppIcon(AppIcons.searchRounded),
                    hintText: t.t('phoneContacts.search'),
                    semanticLabel: t.t('phoneContacts.search'),
                    onChanged: (v) =>
                        setState(() => _query = v.trim().toLowerCase()),
                  ),
                ),
              ),
              if (data.limited)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.screenSide,
                      AppSpacing.sm,
                      AppSpacing.screenSide,
                      0,
                    ),
                    child: Text(t.t('phoneContacts.limited')),
                  ),
                ),
              // At the top: below the invite list it is hundreds of rows away.
              const SliverToBoxAdapter(child: _NotifyNewSwitch()),
              SliverToBoxAdapter(
                child: ContactsSectionTitle(
                  t.t('phoneContacts.onLawBid'),
                  count: onLawBid.length,
                ),
              ),
              if (onLawBid.isEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.screenSide),
                    child: Text(
                      t.t(
                        _query.isEmpty
                            ? 'phoneContacts.empty'
                            : 'phoneContacts.noResults',
                      ),
                    ),
                  ),
                )
              else
                SliverList.builder(
                  itemCount: onLawBid.length,
                  itemBuilder: (context, i) => LawBidContactRow(
                    contact: onLawBid[i],
                    onTap: () => _openProfile(context, ref, onLawBid[i]),
                    trailing: _Actions(contact: onLawBid[i]),
                  ),
                ),
              // Owner 2026-10-21 (inbox 25b, Instagram): anyone in the app
              // by name or @username, under my contacts.
              SliverToBoxAdapter(
                child: PeopleSuggestList(
                  key: const ValueKey('contacts-suggest'),
                  query: _query,
                  scrollable: false,
                  title: t.t('search.tab.people'),
                  excludeIds: {for (final c in data.onLawBid) c.userId},
                  onPick: (p) => _openPerson(context, ref, p),
                ),
              ),
              if (invite.isNotEmpty) ...[
                SliverToBoxAdapter(
                  child: ContactsSectionTitle(
                    t.t('phoneContacts.invite'),
                    count: invite.length,
                  ),
                ),
                SliverList.builder(
                  itemCount: invite.length,
                  itemBuilder: (context, i) => InviteContactRow(
                    contact: invite[i],
                    onInvite: () => inviteContact(context, ref, invite[i].name),
                  ),
                ),
              ],
              if (ref.watch(currentUserRoleProvider) == UserRole.client)
                const SliverToBoxAdapter(child: _FindByPhoneSwitch()),
              // Owner 2026-10-20: the «disable and delete contacts» link lives
              // here, not under the Search field.
              const SliverToBoxAdapter(child: ContactsSection()),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    AppSpacing.md,
                    AppSpacing.screenSide,
                    0,
                  ),
                  child: Text(
                    t.t('phoneContacts.syncNote'),
                    style: Theme.of(context)
                        .extension<AppTypographyTokens>()!
                        .caption
                        .copyWith(
                          color: Theme.of(context)
                              .extension<AppColorTokens>()!
                              .textSecondary,
                        ),
                  ),
                ),
              ),
              SliverToBoxAdapter(child: SizedBox(height: bottom)),
            ],
          ),
        );
      },
    );
  }
}

/// A tap on a row opens the person's profile (a chat when they have no
/// public username).
void _openProfile(BuildContext context, WidgetRef ref, LawBidContact c) {
  final username = c.person.username;
  if (username == null || username.isEmpty || c.person.role == 'assistant') {
    unawaited(openDirectChat(context, ref, c.userId));
    return;
  }
  unawaited(
    context.push(
      c.person.isAttorney
          ? AppRoutes.lawyer(username)
          : AppRoutes.client(username),
    ),
  );
}

/// A person found in the whole app: their profile.
void _openPerson(BuildContext context, WidgetRef ref, SuggestedPerson p) {
  unawaited(
    context.push(
      p.isAttorney
          ? AppRoutes.lawyer(p.username)
          : AppRoutes.client(p.username),
    ),
  );
}

/// Message / call / video of one contact. A call needs the chat to be
/// open for calls (same rule as in the conversation); otherwise the chat
/// opens and says why.
class _Actions extends ConsumerWidget {
  const _Actions({required this.contact});

  final LawBidContact contact;

  Future<void> _call(
    BuildContext context,
    WidgetRef ref, {
    required bool video,
  }) async {
    final t = ref.read(translatorProvider);
    try {
      // An existing direct chat decides; none is created just to find out.
      final all = await ref.read(conversationsProvider.future);
      Conversation? conv;
      for (final c in all.items) {
        if (c.isDirect && c.counterpart.id == contact.userId) conv = c;
      }
      if (conv == null || !chatAudioCallAllowed(ref, conv)) {
        if (context.mounted) {
          showAppSnackBar(context, t.t('call.notAllowedRequest'));
          if (conv == null) {
            await openDirectChat(context, ref, contact.userId);
          }
        }
        return;
      }
      await ref.read(callControllerProvider.notifier).call(
            conv.id,
            peer: CallPeer(
              id: contact.userId,
              isAttorney: contact.person.isAttorney,
              displayName: contact.title,
              username: contact.person.username,
              avatarUrl: contact.person.avatarUrl,
            ),
            video: video,
          );
    } on Object {
      if (context.mounted) {
        showAppSnackBar(context, t.t('error.default.message'));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final video = ref.watch(videoCallsEnabledProvider);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ContactActionButton(
          icon: AppIcons.chatBubbleOutlineRounded,
          label: t.t('phoneContacts.message'),
          onPressed: () => openDirectChat(context, ref, contact.userId),
        ),
        ContactActionButton(
          icon: AppIcons.callOutlined,
          label: t.t('call.button'),
          onPressed: () => _call(context, ref, video: false),
        ),
        if (video)
          ContactActionButton(
            icon: AppIcons.videoCameraOutlined,
            label: t.t('call.videoButton'),
            onPressed: () => _call(context, ref, video: true),
          ),
      ],
    );
  }
}

/// Clients: "Let people find me by my number" (on by default). Attorneys'
/// profiles are public, so they have no switch.
class _FindByPhoneSwitch extends ConsumerWidget {
  const _FindByPhoneSwitch();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final on = ref.watch(contactsSyncStatusProvider).value?.findByPhone ?? true;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: Text(t.t('phoneContacts.findByPhone')),
            subtitle: Text(
              t.t('phoneContacts.findByPhoneHint'),
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
            value: on,
            activeTrackColor: colors.gold,
            onChanged: (v) async {
              try {
                await ref
                    .read(contactsSyncRepositoryProvider)
                    .setFindByPhone(enabled: v);
              } on Object {
                if (context.mounted) {
                  showAppSnackBar(context, t.t('error.default.message'));
                }
              }
              ref.invalidate(contactsSyncStatusProvider);
            },
          ),
        ],
      ),
    );
  }
}

/// "Notify me when contacts join LawBid" — on by default.
class _NotifyNewSwitch extends ConsumerStatefulWidget {
  const _NotifyNewSwitch();

  @override
  ConsumerState<_NotifyNewSwitch> createState() => _NotifyNewSwitchState();
}

class _NotifyNewSwitchState extends ConsumerState<_NotifyNewSwitch> {
  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final sync = ref.read(contactsBackgroundSyncProvider);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
      child: SwitchListTile.adaptive(
        contentPadding: EdgeInsets.zero,
        title: Text(t.t('phoneContacts.notifyNew')),
        value: sync.notifyNew,
        activeTrackColor: colors.gold,
        onChanged: (v) async {
          await sync.setNotifyNew(on: v);
          if (mounted) setState(() {});
        },
      ),
    );
  }
}
