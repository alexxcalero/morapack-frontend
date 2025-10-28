"use client";

import * as React from "react";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";

export default function EmotionProvider({ children }) {
  const cache = React.useMemo(() => createCache({ key: "css", prepend: true }), []);
  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
