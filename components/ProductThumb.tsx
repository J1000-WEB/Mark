"use client";

import { useEffect, useState } from "react";

// 같은 세션 안에서 같은 품번을 여러 번 렌더링해도 API를 한 번만 호출하도록 캐싱합니다.
const imageCache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

async function fetchHero(styleCode: string): Promise<string | null> {
  if (imageCache.has(styleCode)) return imageCache.get(styleCode)!;
  if (pending.has(styleCode)) return pending.get(styleCode)!;

  const p = (async () => {
    try {
      const res = await fetch(`/api/product-images?code=${encodeURIComponent(styleCode)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      const hero = json?.ok && json?.product?.hero ? json.product.hero : null;
      imageCache.set(styleCode, hero);
      return hero;
    } catch {
      imageCache.set(styleCode, null);
      return null;
    } finally {
      pending.delete(styleCode);
    }
  })();
  pending.set(styleCode, p);
  return p;
}

export default function ProductThumb({ styleCode, size = 40 }: { styleCode: string; size?: number }) {
  const [url, setUrl] = useState<string | null | undefined>(styleCode ? imageCache.get(styleCode) : null);

  useEffect(() => {
    let alive = true;
    if (!styleCode) return;
    if (imageCache.has(styleCode)) {
      setUrl(imageCache.get(styleCode)!);
      return;
    }
    fetchHero(styleCode).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [styleCode]);

  if (!styleCode) return null;

  const boxStyle = { width: size, height: size };

  if (url === undefined) {
    return <div style={boxStyle} className="shrink-0 animate-pulse rounded-lg bg-slate-100" />;
  }
  if (!url) {
    return (
      <div style={boxStyle} className="flex shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[8px] font-bold text-slate-300">
        No Img
      </div>
    );
  }

  const thumbUrl = url.replace(/\.jpg$/i, ".thumb.jpg");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbUrl}
      alt={styleCode}
      style={boxStyle}
      className="shrink-0 rounded-lg bg-slate-100 object-cover"
      onError={(e) => {
        const el = e.target as HTMLImageElement;
        if (el.src !== url) el.src = url; // 썸네일이 없으면 원본으로 폴백
      }}
    />
  );
}
