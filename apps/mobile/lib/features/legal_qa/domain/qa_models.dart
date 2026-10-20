import 'package:flutter/foundation.dart';

/// Owner 2026-10-20: «Вопрос юристу» — public questions answered by
/// verified attorneys.
enum QaFilter { all, unanswered, solved, mine }

@immutable
class QaPerson {
  const QaPerson({
    required this.id,
    required this.displayName,
    this.username,
    this.avatarUrl,
  });

  final String id;
  final String displayName;
  final String? username;
  final String? avatarUrl;
}

@immutable
class QaPracticeArea {
  const QaPracticeArea({
    required this.id,
    required this.i18nKey,
    required this.nameEn,
  });

  final String id;
  final String i18nKey;
  final String nameEn;
}

@immutable
class QaAnswer {
  const QaAnswer({
    required this.id,
    required this.questionId,
    required this.attorney,
    required this.body,
    required this.likeCount,
    required this.likedByMe,
    required this.isBest,
    required this.isMine,
    required this.createdAt,
  });

  final String id;
  final String questionId;
  final QaPerson attorney;
  final String body;
  final int likeCount;
  final bool likedByMe;
  final bool isBest;
  final bool isMine;
  final DateTime createdAt;
}

@immutable
class Question {
  const Question({
    required this.id,
    required this.title,
    required this.body,
    required this.isAnonymous,
    required this.isMine,
    required this.answerCount,
    required this.canAnswer,
    required this.createdAt,
    this.practiceArea,
    this.stateCode,
    this.stateName,
    this.author,
    this.bestAnswerId,
    this.myAnswerId,
    this.answers = const [],
  });

  final String id;
  final String title;
  final String body;
  final QaPracticeArea? practiceArea;
  final String? stateCode;
  final String? stateName;
  final bool isAnonymous;

  /// Null when anonymous (the author sees themselves as «Anonymous»).
  final QaPerson? author;
  final bool isMine;
  final int answerCount;
  final String? bestAnswerId;
  final String? myAnswerId;
  final bool canAnswer;
  final DateTime createdAt;

  /// Only on the detail answer.
  final List<QaAnswer> answers;

  bool get solved => bestAnswerId != null;
}

/// A list query; value-equal so it keys a provider family.
@immutable
class QuestionsQuery {
  const QuestionsQuery({
    this.q = '',
    this.practiceAreaId,
    this.practiceLabel,
    this.stateCode,
    this.filter = QaFilter.all,
  });

  final String q;
  final String? practiceAreaId;

  /// Display only — not part of the identity.
  final String? practiceLabel;
  final String? stateCode;
  final QaFilter filter;

  int get activeFilters =>
      (practiceAreaId == null ? 0 : 1) + (stateCode == null ? 0 : 1);

  QuestionsQuery copyWith({
    String? q,
    QaFilter? filter,
    String? practiceAreaId,
    String? practiceLabel,
    String? stateCode,
    bool clearPractice = false,
    bool clearState = false,
  }) =>
      QuestionsQuery(
        q: q ?? this.q,
        filter: filter ?? this.filter,
        practiceAreaId:
            clearPractice ? null : practiceAreaId ?? this.practiceAreaId,
        practiceLabel:
            clearPractice ? null : practiceLabel ?? this.practiceLabel,
        stateCode: clearState ? null : stateCode ?? this.stateCode,
      );

  @override
  bool operator ==(Object other) =>
      other is QuestionsQuery &&
      other.q == q &&
      other.practiceAreaId == practiceAreaId &&
      other.stateCode == stateCode &&
      other.filter == filter;

  @override
  int get hashCode => Object.hash(q, practiceAreaId, stateCode, filter);
}
