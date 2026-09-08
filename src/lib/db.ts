import fs from "fs";
import path from "path";
import { createClient, type Client } from "@libsql/client";
import { seedStore } from "./seed";
import { buildSeedUsers, SEED_USER_DEFS } from "./seed-users";
import { hashPassword } from "./passwords";
import { LOCATIONS, type Activity, type Product, type StockHolding, type User } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const KV_KEY = "store";

export interface StoreData {
  products: Product[];
  stock: StockHolding[];
  activity: Activity[];
  users: User[];
  /** Editable clinic locations (defaults to LOCATIONS). */
  locations: string[];
  nextIds: {
    products: number;
    stock: number;
    activity: number;
    users: number;
  };
}

let storeInstance: StoreData | null = null;
let initPromise: Promise<StoreData> | null = null;
let tursoClient: Client | null = null;

function emptyStore(): StoreData {
  return {
    products: [],
    stock: [],
    activity: [],
    users: [],
    locations: [...LOCATIONS],
    nextIds: { products: 1, stock: 1, activity: 1, users: 1 },
  };
}

function ensureUsersSeeded(store: StoreData): boolean {
  let changed = false;
  if (!store.users) {
    store.users = [];
    changed = true;
  }
  if (!store.nextIds.users) {
    store.nextIds.users = 1;
    changed = true;
  }
  // Migrate legacy activity rows without username
  for (const a of store.activity) {
    if (a.username === undefined) {
      a.username = null;
    }
  }
  // Rename christiane -> faye; Somaieh is Nurse
  for (const u of store.users) {
    if (u.username === "christiane") {
      u.username = "faye";
      changed = true;
    }
    if (u.username === "somaieh" && u.role !== "nurse") {
      u.role = "nurse";
      changed = true;
    }
  }
  for (const a of store.activity) {
    if (a.username === "christiane") {
      a.username = "faye";
      changed = true;
    }
  }
  if (store.users.length === 0) {
    const seeded = buildSeedUsers(store.nextIds.users);
    store.users.push(...seeded);
    store.nextIds.users =
      Math.max(store.nextIds.users, ...seeded.map((u) => u.id)) + 1;
    changed = true;
    console.log(`Seeded ${seeded.length} users`);
  } else {
    const existing = new Set(store.users.map((u) => u.username));
    let nextId =
      Math.max(store.nextIds.users, ...store.users.map((u) => u.id)) + 1;
    const createdAt = new Date().toISOString().replace("T", " ").slice(0, 19);
    for (const def of SEED_USER_DEFS) {
      if (existing.has(def.username)) continue;
      store.users.push({
        id: nextId++,
        username: def.username,
        full_name: def.fullName,
        role: def.role,
        password_hash: hashPassword(def.password),
        created_at: createdAt,
      });
      changed = true;
      console.log(`Added missing seed user: ${def.username}`);
    }
    store.nextIds.users = nextId;
  }
  return changed;
}


/** Ensure store.locations exists and includes every location used in stock/activity. */
export function ensureLocations(store: StoreData): boolean {
  let changed = false;
  if (!Array.isArray(store.locations) || store.locations.length === 0) {
    store.locations = [...LOCATIONS];
    changed = true;
  }
  const set = new Set(store.locations);
  const add = (loc: string | null | undefined) => {
    const name = (loc || "").trim();
    if (!name || set.has(name)) return;
    store.locations.push(name);
    set.add(name);
    changed = true;
  };
  for (const s of store.stock) {
    add(s.location);
  }
  for (const a of store.activity) {
    const loc = a.location || "";
    if (loc.includes(" → ")) {
      const [from, to] = loc.split(" → ");
      add(from);
      add(to);
    } else {
      add(loc);
    }
  }
  return changed;
}

function normalizeStore(parsed: Partial<StoreData> | null | undefined): StoreData {
  if (!parsed?.products || !parsed?.stock || !parsed?.activity || !parsed?.nextIds) {
    return emptyStore();
  }
  const store: StoreData = {
    products: parsed.products,
    stock: parsed.stock,
    activity: parsed.activity,
    users: Array.isArray(parsed.users) ? parsed.users : [],
    locations:
      Array.isArray(parsed.locations) && parsed.locations.length > 0
        ? parsed.locations.map(String)
        : [...LOCATIONS],
    nextIds: {
      products: parsed.nextIds.products ?? 1,
      stock: parsed.nextIds.stock ?? 1,
      activity: parsed.nextIds.activity ?? 1,
      users: parsed.nextIds.users ?? 1,
    },
  };
  // Legacy products may omit price — treat as null.
  for (const prod of store.products) {
    if (prod.price === undefined) {
      prod.price = null;
    }
  }
  ensureLocations(store);
  return store;
}

/** Cloud mode when both Turso env vars are set (Vercel / production). */
export function useTurso(): boolean {
  return Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
}

function getTurso(): Client {
  if (!tursoClient) {
    tursoClient = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
  }
  return tursoClient;
}

async function ensureTursoSchema(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

const TMP_STORE_PATH = "/tmp/clinic-inventory-store.json";

function loadFromDisk(): StoreData {
  const candidates = process.env.VERCEL
    ? [TMP_STORE_PATH, STORE_PATH]
    : [STORE_PATH];
  for (const pathTry of candidates) {
    try {
      if (!fs.existsSync(pathTry)) continue;
      const raw = fs.readFileSync(pathTry, "utf-8");
      return normalizeStore(JSON.parse(raw) as StoreData);
    } catch {
      /* try next */
    }
  }
  return emptyStore();
}

function persistToDisk(store: StoreData): void {
  const payload = JSON.stringify(store, null, 2);
  if (process.env.VERCEL) {
    fs.writeFileSync(TMP_STORE_PATH, payload, "utf-8");
    return;
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmp = STORE_PATH + ".tmp";
  fs.writeFileSync(tmp, payload, "utf-8");
  fs.renameSync(tmp, STORE_PATH);
}

async function loadFromTurso(): Promise<StoreData> {
  const client = getTurso();
  await ensureTursoSchema(client);
  const rs = await client.execute({
    sql: "SELECT value FROM kv WHERE key = ?",
    args: [KV_KEY],
  });
  if (rs.rows.length === 0) return emptyStore();
  try {
    const value = rs.rows[0].value;
    const raw = typeof value === "string" ? value : String(value ?? "");
    return normalizeStore(JSON.parse(raw) as StoreData);
  } catch {
    return emptyStore();
  }
}

async function persistToTurso(store: StoreData): Promise<void> {
  const client = getTurso();
  await ensureTursoSchema(client);
  await client.execute({
    sql: `INSERT INTO kv (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [KV_KEY, JSON.stringify(store)],
  });
}

/** Persist store to Turso (cloud) or local JSON (dev / Mac). */
export async function persistStore(store: StoreData): Promise<void> {
  storeInstance = store;
  if (useTurso()) {
    await persistToTurso(store);
  } else {
    persistToDisk(store);
  }
}

/**
 * Get the in-memory store (loads + seeds on first call).
 * Uses Turso when TURSO_DATABASE_URL + TURSO_AUTH_TOKEN are set;
 * otherwise falls back to data/store.json.
 * Seeds products from CSV when empty; always seeds users when users[] is empty.
 */
export async function getStore(): Promise<StoreData> {
  if (storeInstance) return storeInstance;
  if (!initPromise) {
    initPromise = (async () => {
      const store = useTurso() ? await loadFromTurso() : loadFromDisk();
      let dirty = false;
      if (store.products.length === 0) {
        seedStore(store);
        dirty = true;
      }
      if (ensureUsersSeeded(store)) {
        dirty = true;
      }
      if (ensureLocations(store)) {
        dirty = true;
      }
      if (dirty) {
        await persistStore(store);
      }
      storeInstance = store;
      return store;
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export function recalculateTotal(store: StoreData, productId: number): number {
  const total = store.stock
    .filter((s) => s.product_id === productId)
    .reduce((sum, s) => sum + s.qty, 0);
  const product = store.products.find((p) => p.id === productId);
  if (product) product.total = total;
  return total;
}

export function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function toPublicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
  };
}
