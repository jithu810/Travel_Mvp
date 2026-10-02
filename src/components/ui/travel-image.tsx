"use client";

import Image from "next/image";
import { useState } from "react";

export function TravelImage({ src, alt, sizes, priority = false }: { src: string; alt: string; sizes: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <Image src={failed ? "/images/goa.jpg" : src} alt={alt} fill sizes={sizes} priority={priority}
    unoptimized={!failed && src.startsWith("https:")} onError={() => setFailed(true)} className="object-cover transition-transform duration-500 group-hover:scale-105" />;
}
