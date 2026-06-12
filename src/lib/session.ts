import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "gold_coast_field_connect_session";

export type StoredSession = {
  baseUrl: string;
  cookie: string;
  user: string;
  fullName: string;
};

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    await clearSession();
    return null;
  }
}

export async function saveSession(session: StoredSession) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

