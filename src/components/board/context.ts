"use client";
import { createContext, useContext } from "react";

export interface BoardCtx {
  /** Move the teacher's pointer to a viewport (client) coordinate. */
  moveTo: (clientX: number, clientY: number) => void;
  registerEl: (index: number, el: HTMLElement | null) => void;
  getStepEl: (index: number) => HTMLElement | null;
  contentEl: () => HTMLElement | null;
}

export const BoardContext = createContext<BoardCtx | null>(null);

export function useBoard(): BoardCtx {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard outside Board");
  return ctx;
}
