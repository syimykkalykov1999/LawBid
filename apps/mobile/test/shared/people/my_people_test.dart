import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/shared/people/my_people.dart';

/// Owner 2026-10-22 (WhatsApp «Add participant»): who may be called in from
/// a running call — contacts, accepted chats, mutual follows; never me,
/// never twice, never a stranger.
Conversation _chat(
  String id, {
  String? userId,
  String? name,
  String? username,
  bool isDirect = true,
  bool blocked = false,
  MessageRequest request = MessageRequest.none,
}) =>
    Conversation(
      id: id,
      caseId: isDirect ? null : 'case-$id',
      caseTitle: null,
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: Counterpart(
        isAttorney: true,
        verified: false,
        id: userId,
        displayName: name,
        username: username,
      ),
      unreadCount: 0,
      updatedAt: DateTime(2026),
      isDirect: isDirect,
      blocked: blocked,
      request: request,
    );

MyPerson _p(String id, MyPeopleGroup g, {String name = '', String u = ''}) =>
    MyPerson(id: id, group: g, name: name, username: u);

void main() {
  group('myPeopleFromChats', () {
    test('accepted 1:1 chats (case or direct) only', () {
      final people = myPeopleFromChats([
        _chat('1', userId: 'a', name: 'Anna', username: 'anna'),
        _chat('2', userId: 'b', name: 'Case client', isDirect: false),
        _chat(
          '3',
          userId: 'c',
          name: 'Accepted',
          request: MessageRequest.accepted,
        ),
        _chat('4', userId: 'd', name: 'Blocked', blocked: true),
        _chat(
          '5',
          userId: 'e',
          name: 'Pending',
          request: MessageRequest.pending,
        ),
        _chat(
          '6',
          userId: 'f',
          name: 'Declined',
          request: MessageRequest.declined,
        ),
        // A hidden client: no id, no name.
        _chat('7'),
        _chat('8', userId: 'h', username: 'only_handle'),
      ]);
      expect(people.map((p) => p.id), ['a', 'b', 'c', 'h']);
      expect(people.every((p) => p.group == MyPeopleGroup.chats), isTrue);
      expect(people.first.username, 'anna');
    });
  });

  group('mergeMyPeople', () {
    test('contacts, then chats, then mutual; once each; me left out', () {
      final all = mergeMyPeople(
        contacts: [
          _p('c2', MyPeopleGroup.contacts, name: 'Zara'),
          _p('c1', MyPeopleGroup.contacts, name: 'Adam'),
        ],
        chats: [
          _p('c1', MyPeopleGroup.chats, name: 'Adam again'),
          _p('h1', MyPeopleGroup.chats, name: 'Boris'),
          _p('me', MyPeopleGroup.chats, name: 'Me'),
        ],
        mutual: [
          _p('h1', MyPeopleGroup.mutual, name: 'Boris'),
          _p('m1', MyPeopleGroup.mutual, name: 'Alla'),
        ],
        myId: 'me',
      );
      expect(all.map((p) => p.id), ['c1', 'c2', 'h1', 'm1']);
      expect(all.map((p) => p.group), [
        MyPeopleGroup.contacts,
        MyPeopleGroup.contacts,
        MyPeopleGroup.chats,
        MyPeopleGroup.mutual,
      ]);
      // The first group wins, with its name.
      expect(all.first.name, 'Adam');
    });
  });

  group('filterMyPeople', () {
    final people = [
      _p('1', MyPeopleGroup.contacts, name: 'Anna Smith', u: 'neo_one'),
      _p('2', MyPeopleGroup.chats, name: 'Boris', u: 'boris_law'),
      _p('3', MyPeopleGroup.mutual, u: 'thomas'),
    ];

    test('by name, any case', () {
      expect(filterMyPeople(people, 'SMITH').map((p) => p.id), ['1']);
    });

    test('by @username, the «@» ignored', () {
      expect(filterMyPeople(people, '@neo').map((p) => p.id), ['1']);
      expect(filterMyPeople(people, 'thom').map((p) => p.id), ['3']);
    });

    test('blank = everyone; no match = nobody', () {
      expect(filterMyPeople(people, '  '), people);
      expect(filterMyPeople(people, 'zzz'), isEmpty);
    });
  });
}
