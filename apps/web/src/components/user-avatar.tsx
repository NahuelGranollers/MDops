"use client";

import type { CSSProperties } from "react";
import { assetUrl } from "@/lib/api";

export type AvatarUser = {
  name?: string | null;
  profileColor?: string | null;
  avatarUrl?: string | null;
};

function initials(name: string | null | undefined) {
  const parts = (name ?? "MD").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "MD";
}

export function UserAvatar({ user, size = "md" }: { user: AvatarUser; size?: "sm" | "md" | "lg" }) {
  const src = assetUrl(user.avatarUrl);
  const color = user.profileColor || "#0f766e";
  return (
    <span className={`user-avatar ${size}`} style={{ "--avatar-color": color } as CSSProperties} aria-hidden="true">
      {src ? <img src={src} alt="" /> : initials(user.name)}
    </span>
  );
}
