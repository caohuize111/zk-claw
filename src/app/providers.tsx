"use client";

import dynamic from "next/dynamic";
import { ReactNode } from "react";

const Web3Provider = dynamic(
  () => import("./web3-provider").then((mod) => mod.Web3Provider),
  { ssr: false }
);

export function Providers({ children }: { children: ReactNode }) {
  return <Web3Provider>{children}</Web3Provider>;
}
