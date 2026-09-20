import type { Employee } from "./types";

// A small, deterministic roster (design doc v6.1 §3/§4) covering the departments the
// existing missions already reference as clients. Not the full ~50-person company the
// design doc describes - this is Phase 1's data, sized to flavor a handful of tickets
// rather than a full org chart (accounts/positions-as-systems are deferred).
export const EMPLOYEES: Employee[] = [
  { id: "emp-tanaka", name: "田中", department: "営業部", position: "主任" },
  { id: "emp-suzuki", name: "鈴木", department: "営業部", position: "一般" },
  { id: "emp-sato", name: "佐藤", department: "開発部", position: "主任" },
  { id: "emp-yamada", name: "山田", department: "開発部", position: "一般" },
  { id: "emp-ito", name: "伊藤", department: "総務部", position: "一般" },
  { id: "emp-watanabe", name: "渡辺", department: "経理部", position: "一般" },
  { id: "emp-nakamura", name: "中村", department: "人事部", position: "一般" },
  { id: "emp-kobayashi", name: "小林", department: "情報システム部", position: "部長" },
  { id: "emp-kato", name: "加藤", department: "設計部", position: "一般" },
  { id: "emp-yoshida", name: "吉田", department: "物流部", position: "一般" },
];

export function employeeById(id: string): Employee | undefined {
  return EMPLOYEES.find((e) => e.id === id);
}
