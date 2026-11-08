"use client";

import { useSyncExternalStore } from "react";
import { credentialsSnapshot, subscribeCredentials } from "./credentials";

const serverSnapshot = () => "";

export function useCredentialsSnapshot(): string {
  return useSyncExternalStore(subscribeCredentials, credentialsSnapshot, serverSnapshot);
}
