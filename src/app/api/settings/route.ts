import { NextRequest, NextResponse } from "next/server";
import { ensureLocations, getStore, persistStore } from "@/lib/db";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const EDITOR_ROLES: UserRole[] = ["admin", "manager", "head_nurse"];

function categoriesFromStore(store: Awaited<ReturnType<typeof getStore>>): string[] {
  return [...new Set(store.products.map((p) => p.category).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b)
  );
}

async function requireEditor(req: NextRequest) {
  const username = req.cookies.get("clinic_user")?.value?.toLowerCase();
  if (!username) return { error: NextResponse.json({ error: "Not logged in" }, { status: 401 }) };
  const store = await getStore();
  ensureLocations(store);
  const me = store.users.find((u) => u.username === username);
  if (!me || !EDITOR_ROLES.includes(me.role)) {
    return {
      error: NextResponse.json(
        { error: "Admin, manager, or head nurse only" },
        { status: 403 }
      ),
    };
  }
  return { store, me };
}

export async function GET() {
  try {
    const store = await getStore();
    ensureLocations(store);
    return NextResponse.json({
      locations: store.locations.slice(),
      categories: categoriesFromStore(store),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function replaceLocationToken(text: string, from: string, to: string): string {
  if (!text || !from) return text;
  if (text === from) return to;
  // Transfer display: "A → B"
  if (text.includes(" → ")) {
    return text
      .split(" → ")
      .map((part) => (part.trim() === from ? to : part))
      .join(" → ");
  }
  return text.split(from).join(to);
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireEditor(req);
    if ("error" in auth && auth.error) return auth.error;
    const store = auth.store!;

    const body = await req.json();
    const action = String(body.action || "");
    const from = String(body.from ?? "").trim();
    const to = String(body.to ?? "").trim();

    if (!from) {
      return NextResponse.json({ error: "Source name is required" }, { status: 400 });
    }
    if (!to) {
      return NextResponse.json({ error: "New name cannot be empty" }, { status: 400 });
    }
    if (from === to) {
      return NextResponse.json({
        ok: true,
        locations: store.locations.slice(),
        categories: categoriesFromStore(store),
      });
    }

    if (action === "rename_location") {
      ensureLocations(store);
      if (!store.locations.includes(from)) {
        return NextResponse.json({ error: `Unknown location: ${from}` }, { status: 400 });
      }

      const toExists = store.locations.includes(to);

      // Merge stock qtys per product_id when renaming onto an existing location
      if (toExists) {
        const fromHoldings = store.stock.filter((s) => s.location === from);
        for (const holding of fromHoldings) {
          const target = store.stock.find(
            (s) => s.product_id === holding.product_id && s.location === to
          );
          if (target) {
            target.qty = (target.qty || 0) + (holding.qty || 0);
          } else {
            holding.location = to;
          }
        }
        // Remove any remaining holdings still pointing at `from`
        store.stock = store.stock.filter((s) => s.location !== from);
        store.locations = store.locations.filter((l) => l !== from);
      } else {
        for (const s of store.stock) {
          if (s.location === from) s.location = to;
        }
        store.locations = store.locations.map((l) => (l === from ? to : l));
      }

      for (const a of store.activity) {
        if (a.location) {
          a.location = replaceLocationToken(a.location, from, to);
        }
        if (a.note && a.note.includes(from)) {
          a.note = replaceLocationToken(a.note, from, to);
        }
      }

      await persistStore(store);
      return NextResponse.json({
        ok: true,
        locations: store.locations.slice(),
        categories: categoriesFromStore(store),
        merged: toExists,
      });
    }

    if (action === "rename_category") {
      let updated = 0;
      for (const p of store.products) {
        if (p.category === from) {
          p.category = to;
          updated++;
        }
      }
      if (updated === 0) {
        return NextResponse.json({ error: `Unknown category: ${from}` }, { status: 400 });
      }
      await persistStore(store);
      return NextResponse.json({
        ok: true,
        locations: store.locations.slice(),
        categories: categoriesFromStore(store),
        updated,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
