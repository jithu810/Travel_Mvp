"use client";

import Image from "next/image";
import { useState } from "react";

export function CreatorAvatar({ name, src, size = "default" }: { name: string; src: string | null; size?: "default" | "profile" }) {
  const [failed, setFailed] = useState(false);
  return <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e7eedf] font-semibold text-brand ${size === "profile" ? "h-20 w-20 text-xl" : "h-11 w-11 text-sm"}`}>{src && !failed ? <Image src={src} alt="" fill unoptimized onError={() => setFailed(true)} className="object-cover"/> : name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>;
}
