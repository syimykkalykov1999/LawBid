/// Contact channel for `POST /users/me/contacts/{request,verify}` and
/// `POST /auth/otp/request` (docs/01_FOUNDATION_AUTH.md §10.5).
enum ContactType {
  phone,
  email;

  String get wireName => name;
}
