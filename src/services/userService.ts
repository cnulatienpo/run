import path from "path";
import { randomUUID } from "crypto";
import { UserProfile } from "../models/user";
import { ensureFile, readJson, writeJson } from "../utils/jsonStore";

const DATA_DIR = path.resolve(process.cwd(), "data");
const USER_FILE = path.join(DATA_DIR, "users.json");
const DEFAULT_USER_ID = "demo-user";

const userFileReady = ensureFile(USER_FILE, []);

function cloneUser(user: UserProfile): UserProfile {
  return { ...user };
}

async function loadUsers(): Promise<UserProfile[]> {
  await userFileReady;
  const data = await readJson<UserProfile[] | undefined>(USER_FILE);
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map(cloneUser);
}

async function writeUsers(users: UserProfile[]): Promise<void> {
  await writeJson(USER_FILE, users);
}

function setDefaultUser(users: UserProfile[], defaultId: string): UserProfile[] {
  return users.map((user) => ({
    ...user,
    isDefault: user.id === defaultId,
  }));
}

function applyDefaultCache(users: UserProfile[]): void {
  cachedDefaultUser = users.find((user) => user.isDefault) ?? null;
}

let cachedDefaultUser: UserProfile | null = null;

export async function listUsers(): Promise<UserProfile[]> {
  const users = await loadUsers();
  return users.map(cloneUser);
}

export async function getUser(id: string): Promise<UserProfile | null> {
  const users = await loadUsers();
  const user = users.find((item) => item.id === id);
  return user ? cloneUser(user) : null;
}

export async function createUser(input: {
  name: string;
  color?: string;
  avatarEmoji?: string;
  isDefault?: boolean;
}): Promise<UserProfile> {
  const users = await loadUsers();
  const now = new Date().toISOString();
  const name = input.name.trim();
  if (!name) {
    throw new Error("name is required");
  }
  const user: UserProfile = {
    id: randomUUID(),
    name,
    color: input.color?.trim() || undefined,
    avatarEmoji: input.avatarEmoji?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    isDefault: input.isDefault ?? false,
  };

  let nextUsers = [...users, user];
  if (user.isDefault) {
    nextUsers = setDefaultUser(nextUsers, user.id);
  }

  await writeUsers(nextUsers);
  applyDefaultCache(nextUsers);
  return cloneUser(nextUsers.find((item) => item.id === user.id)!);
}

export async function updateUser(
  id: string,
  partial: Partial<Pick<UserProfile, "name" | "color" | "avatarEmoji" | "isDefault">>
): Promise<UserProfile | null> {
  let users = await loadUsers();
  const index = users.findIndex((user) => user.id === id);
  if (index === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const nextName =
    partial.name !== undefined ? partial.name.trim() : users[index].name;
  const updatedUser: UserProfile = {
    ...users[index],
    ...partial,
    name: nextName,
    color:
      partial.color !== undefined
        ? partial.color.trim() || undefined
        : users[index].color,
    avatarEmoji:
      partial.avatarEmoji !== undefined
        ? partial.avatarEmoji.trim() || undefined
        : users[index].avatarEmoji,
    isDefault:
      partial.isDefault !== undefined
        ? partial.isDefault
        : users[index].isDefault,
    updatedAt: now,
  };

  users[index] = updatedUser;
  if (partial.isDefault === true) {
    users = setDefaultUser(users, id);
  }

  await writeUsers(users);
  applyDefaultCache(users);
  const result = users.find((user) => user.id === id)!;
  return cloneUser(result);
}

export async function deleteUser(id: string): Promise<boolean> {
  const users = await loadUsers();
  const index = users.findIndex((user) => user.id === id);
  if (index === -1) {
    return false;
  }

  users.splice(index, 1);
  await writeUsers(users);
  applyDefaultCache(users);
  return true;
}

export async function getDefaultUser(): Promise<UserProfile | null> {
  if (cachedDefaultUser) {
    return cloneUser(cachedDefaultUser);
  }
  const users = await loadUsers();
  const defaultUser = users.find((user) => user.isDefault);
  if (!defaultUser) {
    return null;
  }
  cachedDefaultUser = defaultUser;
  return cloneUser(defaultUser);
}

export async function ensureDefaultUser(): Promise<UserProfile> {
  if (cachedDefaultUser) {
    return cloneUser(cachedDefaultUser);
  }

  let users = await loadUsers();
  if (users.length === 0) {
    const now = new Date().toISOString();
    const defaultUser: UserProfile = {
      id: DEFAULT_USER_ID,
      name: "Default",
      createdAt: now,
      updatedAt: now,
      isDefault: true,
    };
    users = [defaultUser];
    await writeUsers(users);
    cachedDefaultUser = defaultUser;
    return cloneUser(defaultUser);
  }

  const defaultUser = users.find((user) => user.isDefault);
  if (defaultUser) {
    cachedDefaultUser = defaultUser;
    return cloneUser(defaultUser);
  }

  users = setDefaultUser(users, users[0].id);
  await writeUsers(users);
  cachedDefaultUser = users[0];
  return cloneUser(users[0]);
}
