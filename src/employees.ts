import type { Employee } from "./types";

// A small, deterministic roster (design doc v7.1 §2) covering the village hall's
// departments. The design doc's own headcounts (財政課6人・健康福祉課8人・住民課7人・
// 建設課7人・産業課5人・総務課11人 etc., ~50 people total) are far larger than what a
// phone-screen ticket queue needs - this stays a small representative roster (as in
// v6.1), just re-themed to the new setting, not a literal 1:1 org chart.
export const EMPLOYEES: Employee[] = [
  { id: "emp-tanaka", name: "田中", department: "住民課", position: "主任" },
  { id: "emp-suzuki", name: "鈴木", department: "住民課", position: "一般" },
  { id: "emp-sato", name: "佐藤", department: "健康福祉課", position: "主任" },
  { id: "emp-yamada", name: "山田", department: "健康福祉課", position: "一般" },
  { id: "emp-ito", name: "伊藤", department: "財政課", position: "一般" },
  { id: "emp-watanabe", name: "渡辺", department: "建設課", position: "一般" },
  { id: "emp-nakamura", name: "中村", department: "産業課", position: "一般" },
  { id: "emp-kobayashi", name: "小林", department: "総務課", position: "課長" },
  { id: "emp-kato", name: "加藤", department: "村議会事務局", position: "一般" },
  { id: "emp-yoshida", name: "吉田", department: "商工会", position: "事務局長" },
];

export function employeeById(id: string): Employee | undefined {
  return EMPLOYEES.find((e) => e.id === id);
}
