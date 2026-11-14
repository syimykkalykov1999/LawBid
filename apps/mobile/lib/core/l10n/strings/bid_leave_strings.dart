// ignore_for_file: lines_longer_than_80_chars
// R2-A batch B (14.11): «Save draft?» when leaving the bid form.
// Other languages: apps/api/prisma/seed/translations (pending_keys/r2-bid-leave.json).

const bidLeaveRu = <String, String>{
  'cases.bidForm.leave.title': 'Сохранить черновик?',
  'cases.bidForm.leave.body':
      'Ставка ещё не отправлена. Сохранённый черновик заполнит форму в следующий раз.',
  'cases.bidForm.leave.save': 'Сохранить черновик',
  'cases.bidForm.leave.discard': 'Не сохранять',
  'cases.bidForm.leave.stay': 'Продолжить',
  'cases.bidForm.leave.saved': 'Черновик сохранён',
};

const bidLeaveEn = <String, String>{
  'cases.bidForm.leave.title': 'Save draft?',
  'cases.bidForm.leave.body':
      'Your bid is not sent yet. A saved draft fills the form next time.',
  'cases.bidForm.leave.save': 'Save draft',
  'cases.bidForm.leave.discard': 'Discard',
  'cases.bidForm.leave.stay': 'Keep editing',
  'cases.bidForm.leave.saved': 'Draft saved',
};
