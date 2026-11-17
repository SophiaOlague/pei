import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

import { AUTH_BASE_URL } from "@/lib/config";

export const authClient = createAuthClient({
  baseURL: AUTH_BASE_URL,
  plugins: [
    expoClient({
      scheme: "gestinovo",
      storage: SecureStore,
      storagePrefix: "telehealth",
    }),
  ],
});
