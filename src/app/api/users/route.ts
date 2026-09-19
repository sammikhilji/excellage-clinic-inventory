import { NextRequest, NextResponse } from "next/server";
import { getStore, persistStore, toPublicUser, nowIso } from "@/lib/db";
import { generatePassword, hashPassword } from "@/lib/passwords";
import type { User, UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const CREATABLE_ROLES: UserRole[] = [
  "admin",
  "manager",
  "head_nurse",
  "nurse",
  "staff",
  "doctor",
  "accountant",
];

const USERNAME_RE = /^[a-z0-9_]+$/;
const PROTECTED_USERNAMES = new Set(["mohamed"]);

async function requireAdmin(req: NextRequest) {
  const username = req.cookies.get("clinic_user")?.value?.toLowerCase();
  if (!username) {
    return { error: NextResponse.json({ error: "Not logged in" }, { status: 401 }) };
  }
  const store = await getStore();
  const me = store.users.find((u) => u.username === username);
  if (!me || me.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Admin only (Mohamed)." },
        { status: 403 }
      ),
    };
  }
  return { store, me };
}

function adminCount(users: User[]): number {
  return users.filter((u) => u.role === "admin").length;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth && auth.error) return auth.error;
  const { store } = auth;
  return NextResponse.json({
    users: store.users.map(toPublicUser),
  });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if ("error" in auth && auth.error) return auth.error;
    const { store } = auth;

    const body = await req.json();
    const fullName = String(body.full_name ?? body.fullName ?? "").trim();
    let username = String(body.username ?? "")
      .trim()
      .toLowerCase();
    const role = String(body.role ?? "").trim() as UserRole;
    const generate = body.generatePassword === true || body.generate === true;
    let password =
      body.password != null && String(body.password).length > 0
        ? String(body.password)
        : "";

    if (!fullName) {
      return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    }
    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }
    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        {
          error:
            "Username must be lowercase letters, numbers, or underscore only",
        },
        { status: 400 }
      );
    }
    if (!CREATABLE_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (store.users.some((u) => u.username === username)) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 409 }
      );
    }

    if (generate || !password) {
      password = generatePassword();
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const id = store.nextIds.users++;
    const user: User = {
      id,
      username,
      full_name: fullName,
      role,
      password_hash: hashPassword(password),
      created_at: nowIso(),
    };
    store.users.push(user);
    await persistStore(store);

    return NextResponse.json({
      user: toPublicUser(user),
      password,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if ("error" in auth && auth.error) return auth.error;
    const { store, me } = auth;

    let username = "";
    const q = req.nextUrl.searchParams.get("username");
    if (q) {
      username = q.trim().toLowerCase();
    } else {
      try {
        const body = await req.json();
        username = String(body.username ?? "")
          .trim()
          .toLowerCase();
      } catch {
        /* no body */
      }
    }

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }
    if (username === me.username) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      );
    }
    if (PROTECTED_USERNAMES.has(username)) {
      return NextResponse.json(
        { error: "Protected account cannot be deleted" },
        { status: 400 }
      );
    }

    const target = store.users.find((u) => u.username === username);
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (target.role === "admin" && adminCount(store.users) <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last admin" },
        { status: 400 }
      );
    }

    store.users = store.users.filter((u) => u.username !== username);
    await persistStore(store);
    return NextResponse.json({ ok: true, username });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
