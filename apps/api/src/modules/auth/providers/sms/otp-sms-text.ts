/**
 * OTP SMS body. With an Android app hash (docs/01 §10.2 D, SMS Retriever)
 * the message must start with "<#>" and end with the 11-character hash on
 * its own line, or Android will not hand it to the app for autofill; iOS
 * autofill (oneTimeCode) reads the code from the same text. Without an app
 * hash, `originDomain` adds the origin-bound line for the website.
 */
export function otpSmsText(
  code: string,
  androidAppHash?: string,
  originDomain?: string,
): string {
  const text = `Your LawBid verification code is ${code}. It expires in 10 minutes. Do not share this code.`;
  if (androidAppHash) return `<#> ${text}\n${androidAppHash}`;
  // S14-11: the origin-bound form (WebOTP on Chrome / Android, domain-bound
  // codes on iOS Safari): a blank line, then `@domain #code` as the LAST
  // line. A phishing page on another domain cannot autofill it. It cannot
  // share the message with the Android SMS Retriever hash, which must
  // itself be the last line — a build with an app hash keeps that form.
  return originDomain ? `${text}\n\n@${originDomain} #${code}` : text;
}
