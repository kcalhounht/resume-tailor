import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = body.username?.trim();
    const password = body.password;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must contain at least 8 characters" },
        { status: 400 }
      );
    }

    const existingUser = await db.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    if (existingUser.rowCount && existingUser.rowCount > 0) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await db.query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username, created_at`,
      [username, passwordHash]
    );

    return NextResponse.json(
      {
        message: "Account created successfully",
        user: result.rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);

    return NextResponse.json(
      { error: "Unable to create account" },
      { status: 500 }
    );
  }
}