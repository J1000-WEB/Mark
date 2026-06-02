"use client";

import * as XLSX from "xlsx";

export type WorkbookData = {
  fileName: string;
  uploadedAt: string;
  sheets: Record<string, any[][]>;
  sheetNames: string[];
};

export default function UploadPanel({
  onLoad,
}: {
  onLoad: (data: WorkbookData) => void;
}) {
  async function handleFile(file?: File) {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });

    const sheets: Record<string, any[][]> = {};
    workbook.SheetNames.forEach((name) => {
      const ws = workbook.Sheets[name];
      sheets[name] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as any[][];
    });

    onLoad({
      fileName: file.name,
      uploadedAt: new Date().toLocaleString("ko-KR"),
      sheets,
      sheetNames: workbook.SheetNames,
    });
  }

  return (
    <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black">📂 데이터 업로드</h2>
          <p className="mt-1 text-sm text-slate-500">
            Mark용 엑셀 파일(.xlsx)을 업로드하면 브라우저에서 바로 분석합니다. 파일은 서버에 저장하지 않습니다.
          </p>
        </div>
        <label className="cursor-pointer rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-700">
          엑셀 파일 선택
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
      </div>
    </section>
  );
}
