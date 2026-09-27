/**
 * OTP SMS body. With an Android app hash (docs/01 §10.2 D, SMS Retriever)
 * the message must start with "<#>" and end with the 11-character hash on
 * its own line, or Android will not hand it to the app for autofill; iOS
 * autofill (oneTimeCode) reads the code from the same text.
 */
export function otpSmsText(code: string, androidAppHash?: string): string {
  const text = `LawBid code: ${code}. Expires in 10 minutes.`;
  return androidAppHash ? `<#> ${text}\n${androidAppHash}` : text;
}
