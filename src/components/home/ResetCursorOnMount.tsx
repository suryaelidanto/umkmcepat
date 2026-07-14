"use client";

import { useEffect } from "react";

export function ResetCursorOnMount() {
  useEffect(() => {
    document.body.style.cursor = "";
    document.documentElement.style.cursor = "";
  }, []);

  return null;
}
