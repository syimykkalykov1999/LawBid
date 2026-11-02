import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/chat/presentation/open_direct_chat.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_sync_repository.dart';
import 'package:lawbid/features/contacts_sync/presentation/contact_actions.dart';
import 'package:lawbid/features/contacts_sync/presentation/contact_rows.dart';
import 'package:lawbid/shared/people/my_people.dart';

/// Owner 2026-10-22: «Chats» — the first tab of the screen the «+» of the
/// chats opens. My people: those I talk with (the most recent conversation
/// first) and my mutual follows, each row like «On LawBid» (avatar, name,
/// role · @username, chat / call / video). Contacts have their own tab.
/// The search box filters by name or @username.
class ChatsTab extends ConsumerStatefulWidget {
  const ChatsTab({super.key});

  @override
  ConsumerState<ChatsTab> createState() => _ChatsTabState();
}

class _ChatsTabState extends ConsumerState<ChatsTab> {
  String _query = '';

  /// The same row as a contact's, so the buttons do the same things.
  LawBidContact _asContact(MyPerson p) => LawBidContact(
        person: ContactPerson(
          hash: '',
          userId: p.id,
          displayName: p.title,
          username: p.username.isEmpty ? null : p.username,
          avatarUrl: p.avatarUrl,
          role: p.role,
        ),
        phoneName: p.name,
      );

  void _open(MyPerson p) {
    if (p.username.isEmpty || p.role == 'assistant') {
      unawaited(openDirectChat(context, ref, p.id));
      return;
    }
    unawaited(
      context.push(
        p.role == 'attorney'
            ? AppRoutes.lawyer(p.username)
            : AppRoutes.client(p.username),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final people = ref.watch(myChatPeopleProvider);
    return people.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, __) => AppEmptyState(
        icon: AppIcons.chatBubbleOutlineRounded,
        message: t.t('error.default.message'),
        action: AppButton(
          label: t.t('common.retry'),
          onPressed: () => ref.invalidate(myChatPeopleProvider),
        ),
      ),
      data: (all) {
        final shown = filterMyPeople(all, _query);
        final bottom = AppSpacing.xxl + MediaQuery.paddingOf(context).bottom;
        return AppRefreshIndicator(
          onRefresh: () async {
            ref.invalidate(myChatPeopleProvider);
            await ref.read(myChatPeopleProvider.future);
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
                    compact: true,
                    leading: const AppIcon(AppIcons.searchRounded),
                    hintText: t.t('phoneContacts.search'),
                    semanticLabel: t.t('phoneContacts.search'),
                    onChanged: (v) => setState(() => _query = v.trim()),
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: ContactsSectionTitle(
                  t.t('inbox.tab.chats'),
                  count: shown.length,
                ),
              ),
              if (shown.isEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.screenSide),
                    child: Text(
                      t.t(
                        _query.isEmpty
                            ? 'call.people.empty'
                            : 'call.people.noMatch',
                      ),
                    ),
                  ),
                )
              else
                SliverList.builder(
                  itemCount: shown.length,
                  itemBuilder: (context, i) {
                    final c = _asContact(shown[i]);
                    return LawBidContactRow(
                      key: ValueKey('chat-person-${shown[i].id}'),
                      contact: c,
                      onTap: () => _open(shown[i]),
                      trailing: ContactActions(contact: c),
                    );
                  },
                ),
              SliverToBoxAdapter(child: SizedBox(height: bottom)),
            ],
          ),
        );
      },
    );
  }
}
