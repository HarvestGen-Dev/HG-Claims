export const sessionExpiredLoginPath = "/login?expired=1";

export function isEndedSessionError(code: string | undefined) {
  return code === "session_expired" ||
    code === "session_not_found" ||
    code === "refresh_token_not_found" ||
    code === "refresh_token_already_used";
}
