"use client";

import { useEffect, useState } from "react";

const cache = new Map<string, any>();
const pending = new Map<string, Promise<any>>();

async function fetchProduct360(styleCode: string): Promise<any> {
  if (cache.has(styleCode)) return cache.get(styleCode);
  if (pending.has(styleCode)) return pending.get(styleCode)!;

  const p = (async () => {
    try {
      const res = await fetch(`/api/product360?code=${encodeURIComponent(styleCode)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      const product = json?.ok && json?.product ? json.product : null;
      cache.set(styleCode, product);
      return product;
    } catch {
      cache.set(styleCode, null);
      return null;
    } finally {
      pending.delete(styleCode);
    }
  })();
  pending.set(styleCode, p);
  return p;
}

export function useProduct360(styleCode: string) {
  const [data, setData] = useState<any>(styleCode ? cache.get(styleCode) : null);

  useEffect(() => {
    let alive = true;
    if (!styleCode) return;
    if (cache.has(styleCode)) {
      setData(cache.get(styleCode));
      return;
    }
    fetchProduct360(styleCode).then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, [styleCode]);

  return data;
}

// 전사 소진율 / 온라인 비중 / (컬러 지정 시) 그 컬러 소진율 배지.
// gi-board 상품360 데이터가 없거나 아직 로딩중이면 조용히 아무것도 안 보여줍니다(에러 아님).
export default function Product360Badges({ styleCode, colorCode }: { styleCode: string; colorCode?: string }) {
  const product = useProduct360(styleCode);
  if (!product) return null;

  const onlineTotal = Number(product.channel?.cumulative?.online || 0);
  const offlineTotal = Number(product.channel?.cumulative?.offline || 0);
  const totalCum = onlineTotal + offlineTotal;
  const onlineShare = totalCum ? (onlineTotal / totalCum) * 100 : null;

  let colorRate: number | null = null;
  if (colorCode && Array.isArray(product.colors)) {
    const match = product.colors.find((c: any) => String(c.color || "").toUpperCase() === colorCode.toUpperCase());
    if (match && typeof match.sellThroughRate === "number") colorRate = match.sellThroughRate;
  }

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {typeof product.sellThroughRate === "number" && (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
          전사 소진율 {product.sellThroughRate.toFixed(0)}%
        </span>
      )}
      {onlineShare !== null && (
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black text-sky-700">
          온라인 비중 {onlineShare.toFixed(0)}%
        </span>
      )}
      {colorRate !== null && (
        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-black text-purple-700">
          이 컬러 소진율 {colorRate.toFixed(0)}%
        </span>
      )}
    </div>
  );
}
