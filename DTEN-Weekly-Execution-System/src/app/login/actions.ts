"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { clearSession, createSession } from "@/server/auth";
import { prisma } from "@/server/prisma";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=missing");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      isActive: true,
    },
  });

  const isValidPassword = user ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!user || !user.isActive || !isValidPassword) {
    redirect("/login?error=invalid");
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}
