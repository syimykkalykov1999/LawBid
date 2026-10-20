import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/groups/application/group_create_rules.dart';
import 'package:lawbid/features/groups/application/people_candidates.dart';

Conversation _chat(
  String id, {
  String? userId,
  String? name,
  bool isDirect = true,
  bool blocked = false,
  MessageRequest request = MessageRequest.none,
}) =>
    Conversation(
      id: id,
      caseId: null,
      caseTitle: null,
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: Counterpart(
        isAttorney: true,
        verified: false,
        id: userId,
        displayName: name,
      ),
      unreadCount: 0,
      updatedAt: DateTime(2026),
      isDirect: isDirect,
      blocked: blocked,
      request: request,
    );

PickedPerson _p(String id, String name) => PickedPerson(userId: id, name: name);

void main() {
  group('peopleFromConversations', () {
    test('keeps real direct counterparts only', () {
      final people = peopleFromConversations([
        _chat('1', userId: 'a', name: 'Anna'),
        _chat('2', userId: 'b', name: 'Blocked', blocked: true),
        _chat(
          '3',
          userId: 'c',
          name: 'Pending',
          request: MessageRequest.pending,
        ),
        _chat('4', userId: 'd', name: 'Case chat', isDirect: false),
        _chat('5', userId: 'e'),
        _chat('6', name: 'No id'),
        _chat(
          '7',
          userId: 'f',
          name: '  Fred  ',
          request: MessageRequest.accepted,
        ),
      ]);
      expect(people.map((p) => p.userId), ['a', 'f']);
      expect(people.last.name, 'Fred');
    });
  });

  group('mergePeopleCandidates', () {
    test('dedupes by id, drops me and excluded, sorts by name', () {
      final merged = mergePeopleCandidates(
        [
          [_p('1', 'zoe'), _p('2', 'Bob'), _p('me', 'Me')],
          [_p('2', 'Bobby'), _p('3', 'alice'), _p('4', 'Dan')],
        ],
        myId: 'me',
        excludeIds: {'4'},
      );
      expect(merged.map((p) => p.userId), ['3', '2', '1']);
      expect(merged[1].name, 'Bob');
    });

    test('is empty without sources', () {
      expect(mergePeopleCandidates(const []), isEmpty);
    });
  });

  test('filterPeople and withoutPeople', () {
    final all = [_p('1', 'Anna'), _p('2', 'Hanna'), _p('3', 'Bob')];
    expect(filterPeople(all, ' ANN ').map((p) => p.userId), ['1', '2']);
    expect(filterPeople(all, ''), all);
    expect(withoutPeople(all, {'2'}).map((p) => p.userId), ['1', '3']);
  });

  group('groupUsernameIssue', () {
    test('accepts valid names', () {
      for (final v in ['abcde', 'Law_firm1', '@abcde', 'a' * 32]) {
        expect(groupUsernameIssue(v), isNull, reason: v);
        expect(groupUsernameRe.hasMatch(v.replaceFirst('@', '')), isTrue);
      }
    });

    test('names the problem', () {
      expect(groupUsernameIssue('1abcde'), GroupUsernameIssue.startsWithLetter);
      expect(groupUsernameIssue('_abcde'), GroupUsernameIssue.startsWithLetter);
      expect(groupUsernameIssue('ab-cde'), GroupUsernameIssue.badChars);
      expect(groupUsernameIssue('abcд1'), GroupUsernameIssue.badChars);
      expect(groupUsernameIssue('abcd'), GroupUsernameIssue.tooShort);
      expect(groupUsernameIssue(''), GroupUsernameIssue.tooShort);
      expect(groupUsernameIssue('a' * 33), GroupUsernameIssue.tooLong);
    });
  });
}
