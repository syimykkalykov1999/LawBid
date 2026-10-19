/// Owner 2026-10-15: a counter like "0 / 3000" keeps its order in
/// right-to-left languages (it used to read "3000 / 0", i.e. "3000 of 0").
/// A left-to-right isolate keeps the digits and the slash in order.
String ltrIsolate(String s) =>
    '${String.fromCharCode(0x2066)}$s${String.fromCharCode(0x2069)}';

/// `@username` for display. Owner 2026-10-19: in Arabic, Hebrew, Persian
/// and Urdu the «@» went after the name («thomas.brennan@»); isolated left
/// to right it reads «@thomas.brennan» in every language.
String atHandle(String? username) => ltrIsolate('@${username ?? ''}');
