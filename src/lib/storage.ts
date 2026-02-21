// storage.ts — Cache local apenas. O hook useBacktest.tsx é a fonte da verdade (Supabase).

export interface StoredBacktest {
  version: string;
  createdAt: string;
  results: any[];
  summary: any;
}

const STORAGE_KEY = "lucrativo-backtest-data";

// Carregar do cache local (localStorage)
export async function loadStoredBacktest(): Promise<StoredBacktest | null> {
  return loadStoredBacktestSync();
}

// Versão síncrona para uso interno
export function loadStoredBacktestSync(): StoredBacktest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Salvar no cache local
export async function saveStoredBacktest(data: StoredBacktest): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('[STORAGE] localStorage save failed:', err);
  }
}

// Exportar como JSON
export function exportStoredBacktestAsJSON(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      alert("Nenhum dado de backtest para exportar.");
      return;
    }
    const data = JSON.parse(raw);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backtest-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[STORAGE] Export failed:', err);
  }
}

// Limpar cache local
export async function clearStoredBacktest(): Promise<void> {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}
