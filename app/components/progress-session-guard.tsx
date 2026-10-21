"use client";

import { useEffect } from "react";
import { checkProgressSessionAcrossTabs } from "../../lib/progress-memory";

// Full-page authentication redirects (including Google) notify already-open tabs.
// No request, credentials, user data or visible UI are involved.
export function ProgressSessionGuard() {
  useEffect(() => { checkProgressSessionAcrossTabs(); }, []);
  return null;
}
