"use client";

import Image from "next/image";
import { useState } from "react";

export function CreatorAvatar({ name, src }: { name: string; src: string | null }) {
  const [failed, setFailed] = useState(false);
  return <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-[#e7eedf] text-sm font-semibold text-brand">{src && !failed ? <Image src={src} alt="" fill unoptimized onError={() => setFailed(true)} className="object-cover"/> : name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>;
}
