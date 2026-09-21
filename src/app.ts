import { BOOK_CATEGORIES, findBookPage } from "./book";
import { BUILDING_OUTLINES, type DoorMarker, type StairArrow } from "./building";
import { cableLengthMeters, isCableTooLong } from "./cables";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  catalogItem,
  DEVICE_CATALOG,
  iconFor,
  isVlanCapable,
  shortLabel,
} from "./devices";
import { diagnoseDevice, ping, runCommunicationTest } from "./diagnostics";
import { employeeById, EMPLOYEES } from "./employees";
import { currentMission, MISSIONS } from "./missions";
import { isValidIp, resolveAllConfigs } from "./netutils";
import {
  OFFICE_SIZE,
  buyDevice,
  connectDevices,
  connectionsOf,
  deviceById,
  disconnectCable,
  moveDevice,
  placeDevice,
  placedDevices,
  portUsageCount,
  resetState,
  setPortAccessMode,
  setPortStatus,
  setPortTrunkMode,
  togglePower,
  unplacedDevices,
  updateClientConfig,
  updateL3SwitchConfig,
  updateRouterConfig,
  upsertVlan,
} from "./state";
import { markTicketInvestigating, openTicketCount, resolveTicket } from "./tickets";
import { DEFAULT_VLAN_ID, isComputerType } from "./types";
import { wifiSignalBetween, wifiSignalLabel } from "./wifi";
import type {
  ClientConfig,
  CurrentStateRow,
  Device,
  DeviceDiagnosis,
  DeviceType,
  GameMode,
  GameState,
  L3SwitchConfig,
  L3SwitchInterface,
  PingResult,
  RouterConfig,
} from "./types";

/** What the info panel is currently showing - a not-yet-owned catalog model, or a
 * specific device instance (unplaced or placed) whose specs + live state we show. */
type InfoTarget = { kind: "catalog"; type: DeviceType } | { kind: "device"; deviceId: string };

interface UiState {
  showShop: boolean;
  showTest: boolean;
  showClear: boolean;
  showSettings: boolean;
  showDiagnosis: boolean;
  showInspection: boolean;
  showBook: boolean;
  showBuildingOutline: boolean;
  showJobLetter: boolean;
  showHelpdesk: boolean;
  helpdeskTicketId: string | null;
  showInfo: boolean;
  infoTarget: InfoTarget | null;
  showCompareSelect: boolean;
  showCompare: boolean;
  compareSelection: DeviceType[];
  settingsDeviceId: string | null;
  diagnosisDeviceId: string | null;
  inspectionDeviceId: string | null;
  bookCategoryId: string | null;
  bookPageId: string | null;
  pingTarget: string;
  pingResult: PingResult | null;
  toast: string | null;
  testResults: DeviceDiagnosis[];
}

function initialUi(): UiState {
  return {
    showShop: false,
    showTest: false,
    showClear: false,
    showSettings: false,
    showDiagnosis: false,
    showInspection: false,
    showBook: false,
    showBuildingOutline: false,
    showJobLetter: false,
    showHelpdesk: false,
    helpdeskTicketId: null,
    showInfo: false,
    infoTarget: null,
    showCompareSelect: false,
    showCompare: false,
    compareSelection: [],
    settingsDeviceId: null,
    diagnosisDeviceId: null,
    inspectionDeviceId: null,
    bookCategoryId: null,
    bookPageId: null,
    pingTarget: "",
    pingResult: null,
    toast: null,
    testResults: [],
  };
}

const money = (v: number) => "¥" + v.toLocaleString("ja-JP");
const STEP_ICON: Record<string, string> = { ok: "✅", fail: "❌", skipped: "➖" };

function portSummary(state: GameState, device: Device): string | null {
  if (device.ports.length <= 1) return null;
  const finiteTotal = device.ports.filter((p) => p.capacity !== null);
  const used = device.ports.reduce((sum, p) => sum + portUsageCount(state, device.id, p.id), 0);
  if (finiteTotal.length < device.ports.length) return `(${used})`;
  const total = finiteTotal.reduce((sum, p) => sum + (p.capacity ?? 1), 0);
  return `(${used}/${total})`;
}

export class App {
  private root: HTMLElement;
  private state: GameState;
  private ui: UiState;
  private toastTimer: number | undefined;

  constructor(root: HTMLElement) {
    this.root = root;
    this.state = resetState();
    this.ui = initialUi();
    this.render();
  }

  private setToast(msg: string) {
    this.ui.toast = msg;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.ui.toast = null;
      this.render();
    }, 2800);
  }

  private setMode(mode: GameMode) {
    this.state.mode = this.state.mode === mode ? "idle" : mode;
    this.state.selectedDeviceId = null;
    this.state.connectFromId = null;
  }

  private handleReset() {
    if (!window.confirm("ゲームをリセットしますか？購入・配置・接続・設定がすべて消えます。")) return;
    this.state = resetState();
    this.ui = initialUi();
    this.render();
  }

  private handleBuy(type: DeviceType) {
    const result = buyDevice(this.state, type);
    if (!result.ok) {
      this.setToast(result.reason ?? "購入できません。");
    } else {
      this.setToast(`${DEVICE_CATALOG.find((d) => d.type === type)?.label}を購入しました。`);
    }
    this.render();
  }

  private infoTargetType(): DeviceType | null {
    const target = this.ui.infoTarget;
    if (!target) return null;
    if (target.kind === "catalog") return target.type;
    return deviceById(this.state, target.deviceId)?.type ?? null;
  }

  private openInfoForCatalog(type: DeviceType) {
    this.ui.infoTarget = { kind: "catalog", type };
    this.ui.showInfo = true;
    this.render();
  }

  private openInfoForDevice(deviceId: string) {
    this.ui.infoTarget = { kind: "device", deviceId };
    this.ui.showInfo = true;
    this.render();
  }

  private handleOpenCompareSelect() {
    // Comparison is model-level (catalog specs), so it starts from whichever model
    // the info panel is currently showing - a placed device compares its own model.
    const type = this.infoTargetType();
    this.ui.compareSelection = type ? [type] : [];
    this.ui.showInfo = false;
    this.ui.showCompareSelect = true;
    this.render();
  }

  private handleToggleCompareSelect(type: DeviceType) {
    const sel = this.ui.compareSelection;
    const idx = sel.indexOf(type);
    if (idx >= 0) sel.splice(idx, 1);
    else sel.push(type);
    this.render();
  }

  private handleOpenCompare() {
    if (this.ui.compareSelection.length < 2) return;
    this.ui.showCompareSelect = false;
    this.ui.showCompare = true;
    this.render();
  }

  private handleSelectUnplaced(id: string) {
    this.state.mode = "placing";
    this.state.selectedDeviceId = this.state.selectedDeviceId === id ? null : id;
    this.render();
  }

  private static readonly SETTINGS_TYPES: DeviceType[] = [
    "router",
    "desktop_pc",
    "notebook_pc",
    "workstation",
    "server",
    "switch4",
    "switch8",
    "l3_switch",
    "onu",
    "wifi",
    "lan_jack",
    "patch_panel",
  ];

  private openDeviceAction(device: Device) {
    if (this.state.mode === "settings") {
      if (App.SETTINGS_TYPES.includes(device.type)) {
        this.ui.settingsDeviceId = device.id;
        this.ui.showSettings = true;
        this.render();
      } else {
        this.setToast("この機器には設定項目がありません。");
      }
      return;
    }
    if (this.state.mode === "diagnosing") {
      if (isComputerType(device.type) || device.type === "server") {
        this.ui.diagnosisDeviceId = device.id;
        this.ui.showDiagnosis = true;
        this.ui.pingResult = null;
      } else {
        this.ui.inspectionDeviceId = device.id;
        this.ui.showInspection = true;
      }
      this.render();
    }
  }

  private handleInfoGotoSettings(deviceId: string) {
    const device = deviceById(this.state, deviceId);
    if (!device) return;
    this.ui.showInfo = false;
    this.state.mode = "settings";
    this.ui.settingsDeviceId = device.id;
    this.ui.showSettings = true;
    this.render();
  }

  private roomFor(device: Device): string | null {
    if (device.x === null || device.y === null) return null;
    const room = this.state.rooms.find(
      (r) => device.x! >= r.x && device.x! <= r.x + r.width && device.y! >= r.y && device.y! <= r.y + r.height
    );
    return room?.name ?? null;
  }

  // "現在の状態" (design doc v5-fix §11) - live game state, kept separate from the
  // model's fixed `specifications`. Reuses the same diagnostics/netutils the rest of
  // the game already uses, rather than recomputing anything new for this panel.
  private portVlanSummary(port: Device["ports"][number]): string {
    if (port.vlanMode === "trunk") {
      const list = port.trunkVlans ?? [];
      return list.length > 0 ? `Trunk(VLAN ${list.join(",")})` : "Trunk（未設定）";
    }
    return `Access(VLAN ${port.accessVlan ?? DEFAULT_VLAN_ID})`;
  }

  private wifiSignalRow(device: Device): CurrentStateRow | null {
    if (device.x === null || device.y === null) return null;
    const conn = connectionsOf(this.state, device.id).find((c) => c.kind === "wifi");
    if (!conn) return null;
    const peerId = conn.fromDevice === device.id ? conn.toDevice : conn.fromDevice;
    const peer = deviceById(this.state, peerId);
    if (!peer || peer.x === null || peer.y === null) return null;
    const signal = wifiSignalBetween(this.state, peer.x, peer.y, device.x, device.y);
    return {
      label: "Wi-Fi電波強度",
      value: wifiSignalLabel(signal),
      ok: signal.category !== "圏外",
    };
  }

  private currentStateRows(device: Device): CurrentStateRow[] {
    const rows: CurrentStateRow[] = [];
    if (device.x === null) {
      rows.push({ label: "設置状況", value: "未設置" });
      return rows;
    }
    if (device.power !== undefined) {
      rows.push({ label: "電源", value: device.power === "on" ? "ON" : "OFF", ok: device.power === "on" });
    }
    const conns = connectionsOf(this.state, device.id);
    const summary = portSummary(this.state, device);
    rows.push({
      label: "配線",
      value: summary ? `接続中 ${summary}` : conns.length > 0 ? `${conns.length}本接続中` : "未配線",
      ok: conns.length > 0,
    });
    if (isComputerType(device.type) || device.type === "server") {
      const diag = diagnoseDevice(this.state, device.id);
      const resolved = resolveAllConfigs(this.state).get(device.id);
      rows.push({ label: "IPアドレス", value: resolved?.ip ?? "未取得", ok: !!resolved?.ip });
      const wifiRow = this.wifiSignalRow(device);
      if (wifiRow) rows.push(wifiRow);
      const firstFail = diag.steps.find((s) => s.status === "fail");
      rows.push({
        label: "通信状態",
        value: diag.success ? "正常（インターネット到達）" : `異常：${firstFail?.label ?? "不明"}`,
        ok: diag.success,
      });
    } else if (device.type === "router") {
      const cfg = device.networkConfig as RouterConfig;
      rows.push({ label: "LAN IPアドレス", value: cfg.lanIp });
      rows.push({ label: "NAT", value: cfg.natEnabled ? "有効" : "無効", ok: cfg.natEnabled });
    } else if (device.type === "l3_switch") {
      const cfg = device.networkConfig as L3SwitchConfig;
      rows.push({
        label: "VLAN構成",
        value: device.ports.map((p, i) => `ポート${i + 1}: ${this.portVlanSummary(p)}`).join(" / "),
      });
      rows.push({
        label: "ルーティングインターフェース（SVI）",
        value:
          cfg.interfaces.length > 0
            ? cfg.interfaces.map((i) => `VLAN${i.vlanId}: ${i.ip}`).join(" / ")
            : "未設定",
        ok: cfg.interfaces.length > 0,
      });
      rows.push({
        label: "アップリンク先ゲートウェイ",
        value: cfg.uplinkGateway || "未設定",
        ok: !!cfg.uplinkGateway,
      });
    } else if (isVlanCapable(device.type)) {
      rows.push({
        label: "VLAN構成",
        value: device.ports.map((p, i) => `ポート${i + 1}: ${this.portVlanSummary(p)}`).join(" / "),
      });
    }
    const room = this.roomFor(device);
    if (room) rows.push({ label: "設置場所", value: room });
    return rows;
  }

  private handleCableTap(connId: string) {
    const conn = this.state.connections.find((c) => c.id === connId);
    if (!conn) return;
    const a = deviceById(this.state, conn.fromDevice);
    const b = deviceById(this.state, conn.toDevice);
    const label = a && b ? `${a.name} ↔ ${b.name}` : "このケーブル";
    if (!window.confirm(`${label} のケーブルを切断しますか？`)) return;
    disconnectCable(this.state, connId);
    this.setToast("ケーブルを切断しました。");
    this.render();
  }

  private handleOfficeClick(evt: MouseEvent, officeEl: HTMLElement) {
    const target = evt.target as HTMLElement;
    const deviceEl = target.closest<HTMLElement>("[data-device-id]");
    const rect = officeEl.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

    if (this.state.mode === "connecting") {
      const cableEl = target.closest<HTMLElement>("[data-conn-id]");
      if (cableEl) {
        this.handleCableTap(cableEl.dataset.connId!);
        return;
      }
    }

    if (this.state.mode === "placing") {
      if (!this.state.selectedDeviceId) return;
      placeDevice(this.state, this.state.selectedDeviceId, x, y);
      this.state.selectedDeviceId = null;
      this.render();
      return;
    }

    if (this.state.mode === "moving") {
      if (deviceEl) {
        const id = deviceEl.dataset.deviceId!;
        const device = deviceById(this.state, id);
        if (device && device.type !== "internet") {
          this.state.selectedDeviceId = this.state.selectedDeviceId === id ? null : id;
        }
      } else if (this.state.selectedDeviceId) {
        moveDevice(this.state, this.state.selectedDeviceId, x, y);
        this.state.selectedDeviceId = null;
      }
      this.render();
      return;
    }

    if (this.state.mode === "connecting") {
      if (!deviceEl) {
        this.state.connectFromId = null;
        this.render();
        return;
      }
      const id = deviceEl.dataset.deviceId!;
      if (!this.state.connectFromId) {
        this.state.connectFromId = id;
        this.render();
        return;
      }
      if (this.state.connectFromId === id) {
        this.state.connectFromId = null;
        this.render();
        return;
      }
      const result = connectDevices(this.state, this.state.connectFromId, id);
      this.setToast(result.ok ? "接続しました。" : result.reason ?? "接続できません。");
      this.state.connectFromId = null;
      this.render();
      return;
    }

    // Default (idle) mode: tapping any placed device shows its info panel, so a
    // device's specs/state are reachable from wherever it is without a dedicated
    // "info mode" (design doc v5-fix §14).
    if (this.state.mode === "idle" && deviceEl) {
      const id = deviceEl.dataset.deviceId!;
      if (deviceById(this.state, id)?.type !== "internet") this.openInfoForDevice(id);
      return;
    }

    if ((this.state.mode === "settings" || this.state.mode === "diagnosing") && deviceEl) {
      const device = deviceById(this.state, deviceEl.dataset.deviceId!);
      if (device) this.openDeviceAction(device);
    }
  }

  private handleRunTest() {
    this.ui.testResults = runCommunicationTest(this.state);
    this.ui.showTest = true;
    this.render();
  }

  private handleClaimReward() {
    const mission = currentMission(this.state);
    if (!mission.check(this.state).ok) return;
    if (!this.state.missionCleared[mission.id]) {
      this.state.money += mission.reward;
      this.state.missionCleared[mission.id] = true;
    }
    this.ui.showTest = false;
    this.ui.showClear = true;
    this.render();
  }

  private handleNextMission() {
    this.ui.showClear = false;
    if (this.state.missionIndex < MISSIONS.length - 1) {
      this.state.missionIndex += 1;
      const next = MISSIONS[this.state.missionIndex];
      next.onActivate?.(this.state);
    }
    this.render();
  }

  private handleOpenHelpdesk() {
    this.ui.showHelpdesk = true;
    this.ui.helpdeskTicketId = null;
    this.render();
  }

  private handleOpenTicket(ticketId: string) {
    markTicketInvestigating(this.state, ticketId);
    this.ui.helpdeskTicketId = ticketId;
    this.render();
  }

  private handleTicketGotoDevice(deviceId: string) {
    const device = deviceById(this.state, deviceId);
    if (!device) return;
    this.ui.showHelpdesk = false;
    this.state.mode = "diagnosing";
    this.ui.diagnosisDeviceId = device.id;
    this.ui.showDiagnosis = true;
    this.ui.pingResult = null;
    this.render();
  }

  private handleResolveTicket(ticketId: string) {
    const result = resolveTicket(this.state, ticketId);
    if (result.ok) {
      this.setToast("チケットを対応完了にしました。");
    } else {
      this.setToast(result.reason ?? "対応完了にできません。");
    }
    this.render();
  }

  private saveClientSettings(deviceId: string) {
    const form = this.root.querySelector<HTMLFormElement>("#settings-form");
    if (!form) return;
    const dhcpEnabled = (form.elements.namedItem("dhcpEnabled") as HTMLInputElement).checked;
    const ip = (form.elements.namedItem("ip") as HTMLInputElement).value.trim();
    const subnetMask = (form.elements.namedItem("subnetMask") as HTMLInputElement).value.trim();
    const gateway = (form.elements.namedItem("gateway") as HTMLInputElement).value.trim();
    const dns = (form.elements.namedItem("dns") as HTMLInputElement).value.trim();
    if (!dhcpEnabled) {
      for (const [label, value] of [
        ["IPアドレス", ip],
        ["サブネットマスク", subnetMask],
      ] as const) {
        if (value && !isValidIp(value)) {
          this.setToast(`${label}の形式が正しくありません。`);
          return;
        }
      }
      if (gateway && !isValidIp(gateway)) {
        this.setToast("デフォルトゲートウェイの形式が正しくありません。");
        return;
      }
      if (dns && !isValidIp(dns)) {
        this.setToast("DNSの形式が正しくありません。");
        return;
      }
    }
    updateClientConfig(this.state, deviceId, { dhcpEnabled, ip, subnetMask, gateway, dns });
    this.setToast("設定を保存しました。");
    this.ui.showSettings = false;
    this.render();
  }

  private saveRouterSettings(deviceId: string) {
    const form = this.root.querySelector<HTMLFormElement>("#settings-form");
    if (!form) return;
    const lanIp = (form.elements.namedItem("lanIp") as HTMLInputElement).value.trim();
    const subnetMask = (form.elements.namedItem("subnetMask") as HTMLInputElement).value.trim();
    const dhcpEnabled = (form.elements.namedItem("dhcpEnabled") as HTMLInputElement).checked;
    const dhcpStart = (form.elements.namedItem("dhcpStart") as HTMLInputElement).value.trim();
    const dhcpEnd = (form.elements.namedItem("dhcpEnd") as HTMLInputElement).value.trim();
    const natEnabled = (form.elements.namedItem("natEnabled") as HTMLInputElement).checked;
    for (const [label, value] of [
      ["ルーターのIPアドレス", lanIp],
      ["サブネットマスク", subnetMask],
    ] as const) {
      if (!isValidIp(value)) {
        this.setToast(`${label}の形式が正しくありません。`);
        return;
      }
    }
    if (dhcpEnabled) {
      if (!isValidIp(dhcpStart) || !isValidIp(dhcpEnd)) {
        this.setToast("DHCPの範囲の形式が正しくありません。");
        return;
      }
    }
    updateRouterConfig(this.state, deviceId, {
      lanIp,
      subnetMask,
      dhcpEnabled,
      dhcpStart,
      dhcpEnd,
      natEnabled,
    });
    this.setToast("設定を保存しました。");
    this.ui.showSettings = false;
    this.render();
  }

  private saveL3SwitchSettings(deviceId: string) {
    const form = this.root.querySelector<HTMLFormElement>("#settings-form");
    if (!form) return;
    const interfaces: L3SwitchInterface[] = [];
    for (const v of this.state.vlans) {
      const enabled = (form.elements.namedItem(`l3vlan-${v.id}-enabled`) as HTMLInputElement | null)?.checked;
      if (!enabled) continue;
      const ip = (form.elements.namedItem(`l3vlan-${v.id}-ip`) as HTMLInputElement).value.trim();
      const subnetMask = (form.elements.namedItem(`l3vlan-${v.id}-mask`) as HTMLInputElement).value.trim();
      const dhcpEnabled = (form.elements.namedItem(`l3vlan-${v.id}-dhcp`) as HTMLInputElement).checked;
      const dhcpStart = (form.elements.namedItem(`l3vlan-${v.id}-dhcpStart`) as HTMLInputElement).value.trim();
      const dhcpEnd = (form.elements.namedItem(`l3vlan-${v.id}-dhcpEnd`) as HTMLInputElement).value.trim();
      if (!isValidIp(ip) || !isValidIp(subnetMask)) {
        this.setToast(`VLAN ${v.id}のIPアドレス/サブネットマスクの形式が正しくありません。`);
        return;
      }
      if (dhcpEnabled && (!isValidIp(dhcpStart) || !isValidIp(dhcpEnd))) {
        this.setToast(`VLAN ${v.id}のDHCP範囲の形式が正しくありません。`);
        return;
      }
      interfaces.push({ vlanId: v.id, ip, subnetMask, dhcpEnabled, dhcpStart, dhcpEnd });
    }
    const uplinkGateway = (form.elements.namedItem("uplinkGateway") as HTMLInputElement).value.trim();
    if (uplinkGateway && !isValidIp(uplinkGateway)) {
      this.setToast("アップリンク先ゲートウェイの形式が正しくありません。");
      return;
    }
    updateL3SwitchConfig(this.state, deviceId, { interfaces, uplinkGateway });
    this.setToast("設定を保存しました。");
    this.ui.showSettings = false;
    this.render();
  }

  private handleAddVlan() {
    const idInput = this.root.querySelector<HTMLInputElement>("#vlan-add-id");
    const nameInput = this.root.querySelector<HTMLInputElement>("#vlan-add-name");
    if (!idInput || !nameInput) return;
    const id = Number(idInput.value);
    const name = nameInput.value.trim();
    if (!Number.isInteger(id) || id <= 0) {
      this.setToast("VLAN IDは1以上の整数で入力してください。");
      return;
    }
    if (!name) {
      this.setToast("VLAN名を入力してください。");
      return;
    }
    upsertVlan(this.state, id, name);
    this.setToast(`VLAN ${id}（${name}）を登録しました。`);
    this.render();
  }

  private handlePortVlanModeChange(deviceId: string, portId: string, mode: "access" | "trunk") {
    if (mode === "access") {
      setPortAccessMode(this.state, deviceId, portId, DEFAULT_VLAN_ID);
    } else {
      setPortTrunkMode(this.state, deviceId, portId, []);
    }
    this.render();
  }

  private handlePortAccessVlanChange(deviceId: string, portId: string, vlanId: number) {
    setPortAccessMode(this.state, deviceId, portId, vlanId);
    this.render();
  }

  private handlePortTrunkVlanToggle(deviceId: string, portId: string, vlanId: number, checked: boolean) {
    const port = deviceById(this.state, deviceId)?.ports.find((p) => p.id === portId);
    if (!port) return;
    const current = new Set(port.trunkVlans ?? []);
    if (checked) current.add(vlanId);
    else current.delete(vlanId);
    setPortTrunkMode(this.state, deviceId, portId, [...current]);
    this.render();
  }

  private handleRunPing() {
    const input = this.root.querySelector<HTMLInputElement>("#ping-input");
    const deviceId = this.ui.diagnosisDeviceId;
    if (!input || !deviceId) return;
    const target = input.value.trim();
    this.ui.pingTarget = target;
    this.ui.pingResult = ping(this.state, deviceId, target);
    this.render();
  }

  private modeInstruction(): string {
    switch (this.state.mode) {
      case "placing":
        return this.state.selectedDeviceId
          ? "配置したい場所をタップしてください。"
          : "下のリストから配置する機器を選んでください。";
      case "moving":
        return this.state.selectedDeviceId
          ? "移動先をタップしてください。"
          : "移動したい機器をタップしてください。";
      case "connecting":
        return this.state.connectFromId
          ? "つなぎたい機器（B）をタップしてください。ケーブルをタップすると切断できます。"
          : "つなぎたい機器（A）をタップしてください。ケーブルをタップすると切断できます。";
      case "settings":
        return "設定したい機器（ルーター／スイッチ／ONU／AP／PC／サーバー）をタップしてください。";
      case "diagnosing":
        return "調べたい機器をタップしてください（PC/サーバーは通信診断、それ以外は現場調査）。";
      default:
        return "機器をタップすると情報を確認できます。🛒購入・🖐移動・🔌配線・⚙設定・🔍調査・▶テストで操作しよう。分からないことは📖で調べられます。";
    }
  }

  private renderOfficeDevices(): string {
    return placedDevices(this.state)
      .map((d) => {
        const selected = d.id === this.state.selectedDeviceId || d.id === this.state.connectFromId;
        const summary = portSummary(this.state, d);
        return `<div class="device device--${d.type} ${selected ? "device--selected" : ""}"
          data-device-id="${d.id}"
          style="left:${d.x}px;top:${d.y}px">
          ${d.type !== "internet" ? `<button class="device-info-btn" data-info-device="${d.id}" title="情報">i</button>` : ""}
          <div class="device-icon">${iconFor(d.type)}</div>
          <div class="device-label">${d.name}${summary ? ` <span class="device-ports">${summary}</span>` : ""}</div>
        </div>`;
      })
      .join("");
  }

  private renderRooms(): string {
    return this.state.rooms
      .map(
        (r) =>
          `<div class="room room--wall-${r.wallMaterial} room--floor-${r.floorFinish}"
            style="left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px">
            <span class="room-label">${r.name}<span class="room-building">${r.building}</span></span>
          </div>`
      )
      .join("");
  }

  private renderCables(): string {
    const devices = placedDevices(this.state);
    const byId = new Map(devices.map((d) => [d.id, d]));
    return this.state.connections
      .map((c) => {
        const a = byId.get(c.fromDevice);
        const b = byId.get(c.toDevice);
        if (!a || !b || a.x === null || a.y === null || b.x === null || b.y === null) return "";
        const tooLong = isCableTooLong(cableLengthMeters(a.x, a.y, b.x, b.y));
        return `<line data-conn-id="${c.id}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="cable-hit" />
          <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="cable ${
            c.kind === "wifi" ? "cable--wifi" : ""
          } ${tooLong ? "cable--too-long" : ""}" />`;
      })
      .join("");
  }

  private renderInventory(): string {
    const items = unplacedDevices(this.state);
    if (items.length === 0) return "";
    return `<div class="inventory-tray">
      <div class="inventory-label">未配置の機器（タップして選択）</div>
      <div class="inventory-list">
        ${items
          .map(
            (d) => `<div class="chip-wrap">
              <button class="chip ${
                d.id === this.state.selectedDeviceId ? "chip--selected" : ""
              }" data-unplaced-id="${d.id}">
                <span class="chip-icon">${iconFor(d.type)}</span>${d.name}
              </button>
              <button class="chip-info-btn" data-info-device="${d.id}" title="情報">情報</button>
            </div>`
          )
          .join("")}
      </div>
    </div>`;
  }

  private renderShop(): string {
    if (!this.ui.showShop) return "";
    return `<div class="overlay" data-overlay="shop">
      <div class="sheet">
        <div class="sheet-header">
          <h2>🛒 機器ショップ</h2>
          <button class="close-btn" data-close="shop">✕</button>
        </div>
        ${CATEGORY_ORDER.map((cat) => {
          const items = DEVICE_CATALOG.filter((i) => i.category === cat);
          if (items.length === 0) return "";
          return `<div class="shop-category">
            <div class="shop-category-title">${CATEGORY_LABELS[cat]}</div>
            <div class="shop-list">
              ${items
                .map(
                  (item) => `<div class="shop-item">
                    <div class="shop-item-icon">${iconFor(item.type)}</div>
                    <div class="shop-item-info">
                      <div class="shop-item-name">${item.label}</div>
                      <div class="shop-item-desc">${item.description}</div>
                      <div class="shop-item-price">${money(item.price)}</div>
                    </div>
                    <div class="shop-item-actions">
                      <button class="buy-btn" data-buy="${item.type}" ${
                        this.state.money < item.price ? "disabled" : ""
                      }>購入</button>
                      <button class="info-btn" data-info-catalog="${item.type}">情報</button>
                    </div>
                  </div>`
                )
                .join("")}
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>`;
  }

  private specTable(item: (typeof DEVICE_CATALOG)[number]): string {
    const rows: Array<[string, string]> = [
      ["価格", money(item.price)],
      ["ポート", item.ports.map((p) => p.type).join(" / ") || "なし"],
      ...Object.entries(item.specifications),
    ];
    return `<table class="spec-table">
      ${rows.map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`).join("")}
    </table>`;
  }

  private renderInfo(): string {
    if (!this.ui.showInfo || !this.ui.infoTarget) return "";
    const target = this.ui.infoTarget;
    const type = target.kind === "catalog" ? target.type : deviceById(this.state, target.deviceId)?.type;
    if (!type) return "";
    const item = catalogItem(type);
    const device = target.kind === "device" ? deviceById(this.state, target.deviceId) : undefined;

    const stateSection =
      device
        ? `<div class="info-section-label">現在の状態</div>
           <table class="spec-table">
             ${this.currentStateRows(device)
               .map(
                 (r) =>
                   `<tr><th>${r.label}</th><td class="${r.ok === false ? "spec-value--bad" : r.ok === true ? "spec-value--ok" : ""}">${r.value}</td></tr>`
               )
               .join("")}
           </table>`
        : "";

    const actions = device
      ? `<div class="info-actions">
          ${
            App.SETTINGS_TYPES.includes(device.type)
              ? `<button class="save-btn" data-info-goto-settings="${device.id}">⚙ 設定を開く</button>`
              : ""
          }
        </div>`
      : `<button class="save-btn" data-buy="${item.type}" ${this.state.money < item.price ? "disabled" : ""}>購入する</button>`;

    return `<div class="overlay" data-overlay="info">
      <div class="sheet">
        <div class="sheet-header">
          <h2>${iconFor(item.type)} ${device ? device.name : item.label}</h2>
          <button class="close-btn" data-close="info">✕</button>
        </div>
        ${device ? `<div class="info-model-label">${item.label}</div>` : ""}
        <div class="info-section-label">機器仕様</div>
        ${this.specTable(item)}
        ${stateSection}
        ${actions}
        <button class="compare-link-btn" data-open-compare-select="1">📊 他の機器と比較</button>
      </div>
    </div>`;
  }

  private renderCompareSelect(): string {
    if (!this.ui.showCompareSelect) return "";
    const sel = this.ui.compareSelection;
    return `<div class="overlay" data-overlay="compareSelect">
      <div class="sheet">
        <button class="book-back" data-back-to-info="1">← 情報に戻る</button>
        <div class="sheet-header">
          <h2>📊 比較する機器を選択</h2>
          <button class="close-btn" data-close="compareSelect">✕</button>
        </div>
        <div class="shop-list">
          ${DEVICE_CATALOG.map(
            (item) => `<label class="field field--checkbox compare-select-item">
              <input type="checkbox" data-compare-select-toggle="${item.type}" ${
                sel.includes(item.type) ? "checked" : ""
              } />
              <div class="shop-item-icon">${iconFor(item.type)}</div>
              <div class="shop-item-info">
                <div class="shop-item-name">${item.label}</div>
                <div class="shop-item-price">${money(item.price)}</div>
              </div>
            </label>`
          ).join("")}
        </div>
        <button class="compare-fab" data-open-compare="1" ${sel.length < 2 ? "disabled" : ""}>
          ${sel.length >= 2 ? `選択した${sel.length}件を比較する` : "2件以上選択してください"}
        </button>
      </div>
    </div>`;
  }

  private renderCompare(): string {
    if (!this.ui.showCompare) return "";
    const items = this.ui.compareSelection
      .map((t) => DEVICE_CATALOG.find((i) => i.type === t))
      .filter((i): i is (typeof DEVICE_CATALOG)[number] => !!i);
    if (items.length === 0) return "";
    const specKeys = Array.from(new Set(items.flatMap((i) => Object.keys(i.specifications))));
    const rows: Array<{ label: string; values: string[] }> = [
      { label: "価格", values: items.map((i) => money(i.price)) },
      { label: "ポート", values: items.map((i) => i.ports.map((p) => p.type).join(" / ") || "なし") },
      ...specKeys.map((key) => ({ label: key, values: items.map((i) => i.specifications[key] ?? "-") })),
    ];
    return `<div class="overlay" data-overlay="compare">
      <div class="sheet">
        <div class="sheet-header"><h2>📊 機器の比較</h2><button class="close-btn" data-close="compare">✕</button></div>
        <div class="compare-table-wrap">
          <table class="compare-table">
            <thead>
              <tr><th></th>${items.map((i) => `<th>${iconFor(i.type)} ${i.label}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row) =>
                    `<tr><th>${row.label}</th>${row.values.map((v) => `<td>${v}</td>`).join("")}</tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  private renderPowerToggle(device: Device): string {
    if (device.power === undefined) return "";
    return `<label class="field field--checkbox">
      <input type="checkbox" ${device.power === "on" ? "checked" : ""} data-power-toggle="${device.id}" />
      <span>⚡ 電源を入れる</span>
    </label>`;
  }

  private renderPortToggles(device: Device): string {
    if (device.ports.length === 0) return "";
    const rows = device.ports
      .map((port) => {
        const conn = this.state.connections.find(
          (c) =>
            (c.fromDevice === device.id && c.fromPort === port.id) ||
            (c.toDevice === device.id && c.toPort === port.id)
        );
        const otherId = conn ? (conn.fromDevice === device.id ? conn.toDevice : conn.fromDevice) : null;
        const other = otherId ? deviceById(this.state, otherId) : null;
        const label = `${port.type}ポート${other ? ` → ${other.name}` : "（空き）"}`;
        return `<label class="field field--checkbox">
          <input type="checkbox" ${port.status === "up" ? "checked" : ""} data-port-fault-toggle="${device.id}:${port.id}" />
          <span>${label}</span>
        </label>`;
      })
      .join("");
    return `<div class="port-toggle-list">
      <div class="port-toggle-label">🔌 ポート状態（チェックを外すとポート障害として扱われます）</div>
      ${rows}
    </div>`;
  }

  private renderVlanManager(): string {
    const rows = this.state.vlans
      .map((v) => `<div class="vlan-row"><span>VLAN ${v.id}</span><span>${v.name}</span></div>`)
      .join("");
    return `<div class="vlan-manager">
      <div class="port-toggle-label">🏷 VLAN一覧</div>
      ${rows}
      <div class="vlan-add-row">
        <input id="vlan-add-id" type="number" min="1" max="4094" placeholder="ID（例：10）" />
        <input id="vlan-add-name" type="text" placeholder="名前（例：営業）" />
        <button type="button" class="save-btn" data-add-vlan="1">追加</button>
      </div>
    </div>`;
  }

  private renderPortVlanConfig(device: Device): string {
    if (!isVlanCapable(device.type) || device.ports.length === 0) return "";
    const rows = device.ports
      .map((port, i) => {
        const mode = port.vlanMode ?? "access";
        const modeSelect = `<select data-port-vlan-mode="${device.id}:${port.id}">
          <option value="access" ${mode === "access" ? "selected" : ""}>Access</option>
          <option value="trunk" ${mode === "trunk" ? "selected" : ""}>Trunk</option>
        </select>`;
        const detail =
          mode === "access"
            ? `<select data-port-access-vlan="${device.id}:${port.id}">
                ${this.state.vlans
                  .map(
                    (v) =>
                      `<option value="${v.id}" ${port.accessVlan === v.id ? "selected" : ""}>${v.name}（VLAN ${v.id}）</option>`
                  )
                  .join("")}
              </select>`
            : `<div class="trunk-vlan-checks">
                ${this.state.vlans
                  .map(
                    (v) => `<label class="field field--checkbox">
                      <input type="checkbox" data-port-trunk-vlan="${device.id}:${port.id}:${v.id}" ${
                        (port.trunkVlans ?? []).includes(v.id) ? "checked" : ""
                      } />
                      <span>VLAN ${v.id}（${v.name}）</span>
                    </label>`
                  )
                  .join("")}
              </div>`;
        return `<div class="port-vlan-row">
          <div class="port-vlan-row-label">ポート${i + 1}</div>
          ${modeSelect}
          ${detail}
        </div>`;
      })
      .join("");
    return `<div class="port-vlan-list">
      <div class="port-toggle-label">🏷 ポートのVLAN設定</div>
      ${rows}
    </div>`;
  }

  private renderL3SwitchConfig(device: Device): string {
    const cfg = device.networkConfig as L3SwitchConfig;
    const rows = this.state.vlans
      .map((v) => {
        const iface = cfg.interfaces.find((i) => i.vlanId === v.id);
        const enabledClass = `l3-fields-${device.id}-${v.id}`;
        const dhcpClass = `l3-dhcp-${device.id}-${v.id}`;
        return `<div class="l3-vlan-row">
          <label class="field field--checkbox">
            <input type="checkbox" name="l3vlan-${v.id}-enabled" data-toggle="${enabledClass}" ${
              iface ? "checked" : ""
            } />
            <span>VLAN ${v.id}（${v.name}）にルーティングインターフェースを設定する</span>
          </label>
          <div class="l3-fields ${enabledClass}" ${iface ? "" : "hidden"}>
            <label class="field">
              <span>IPアドレス（このVLANのゲートウェイ）</span>
              <input name="l3vlan-${v.id}-ip" type="text" value="${iface?.ip ?? ""}" placeholder="192.168.${v.id}.1" />
            </label>
            <label class="field">
              <span>サブネットマスク</span>
              <input name="l3vlan-${v.id}-mask" type="text" value="${iface?.subnetMask ?? "255.255.255.0"}" placeholder="255.255.255.0" />
            </label>
            <label class="field field--checkbox">
              <input type="checkbox" name="l3vlan-${v.id}-dhcp" data-toggle="${dhcpClass}" ${
                iface?.dhcpEnabled ? "checked" : ""
              } />
              <span>このVLANにDHCPで払い出す</span>
            </label>
            <div class="l3-fields ${dhcpClass}" ${iface?.dhcpEnabled ? "" : "hidden"}>
              <label class="field">
                <span>DHCP範囲（開始）</span>
                <input name="l3vlan-${v.id}-dhcpStart" type="text" value="${iface?.dhcpStart ?? ""}" placeholder="192.168.${v.id}.100" />
              </label>
              <label class="field">
                <span>DHCP範囲（終了）</span>
                <input name="l3vlan-${v.id}-dhcpEnd" type="text" value="${iface?.dhcpEnd ?? ""}" placeholder="192.168.${v.id}.200" />
              </label>
            </div>
          </div>
        </div>`;
      })
      .join("");
    return `<div class="l3-switch-config">
      <div class="port-toggle-label">🌐 VLANごとのルーティングインターフェース（SVI）</div>
      ${rows}
      <label class="field">
        <span>アップリンク先ゲートウェイ（ルーターのIPアドレス）</span>
        <input name="uplinkGateway" type="text" value="${cfg.uplinkGateway ?? ""}" placeholder="192.168.1.1" />
      </label>
    </div>`;
  }

  private renderSettings(): string {
    if (!this.ui.showSettings || !this.ui.settingsDeviceId) return "";
    const device = deviceById(this.state, this.ui.settingsDeviceId);
    if (!device) return "";

    if (device.type === "switch4" || device.type === "switch8") {
      return `<div class="overlay" data-overlay="settings">
        <div class="sheet">
          <div class="sheet-header"><h2>⚙ ${device.name} の設定</h2><button class="close-btn" data-close="settings">✕</button></div>
          <form class="settings-form">
            ${this.renderPowerToggle(device)}
            ${this.renderVlanManager()}
            ${this.renderPortVlanConfig(device)}
            ${this.renderPortToggles(device)}
          </form>
        </div>
      </div>`;
    }

    if (device.type === "l3_switch") {
      return `<div class="overlay" data-overlay="settings">
        <div class="sheet">
          <div class="sheet-header"><h2>⚙ ${device.name} の設定</h2><button class="close-btn" data-close="settings">✕</button></div>
          <form id="settings-form" class="settings-form">
            ${this.renderPowerToggle(device)}
            ${this.renderVlanManager()}
            ${this.renderPortVlanConfig(device)}
            ${this.renderL3SwitchConfig(device)}
            ${this.renderPortToggles(device)}
            <button type="button" class="save-btn" data-save-l3switch="${device.id}">保存</button>
          </form>
        </div>
      </div>`;
    }

    if (device.type === "onu" || device.type === "wifi") {
      return `<div class="overlay" data-overlay="settings">
        <div class="sheet">
          <div class="sheet-header"><h2>⚙ ${device.name} の設定</h2><button class="close-btn" data-close="settings">✕</button></div>
          <form class="settings-form">
            ${this.renderPowerToggle(device)}
            ${this.renderPortToggles(device)}
          </form>
        </div>
      </div>`;
    }

    if (device.type === "lan_jack" || device.type === "patch_panel") {
      return `<div class="overlay" data-overlay="settings">
        <div class="sheet">
          <div class="sheet-header"><h2>⚙ ${device.name} の設定</h2><button class="close-btn" data-close="settings">✕</button></div>
          <form class="settings-form">
            ${this.renderPortToggles(device)}
          </form>
        </div>
      </div>`;
    }

    if (device.type === "router") {
      const cfg = device.networkConfig as RouterConfig;
      return `<div class="overlay" data-overlay="settings">
        <div class="sheet">
          <div class="sheet-header"><h2>⚙ ${device.name} の設定</h2><button class="close-btn" data-close="settings">✕</button></div>
          <form id="settings-form" class="settings-form">
            ${this.renderPowerToggle(device)}
            ${this.renderPortToggles(device)}
            <label class="field">
              <span>ルーターのIPアドレス（ゲートウェイ）</span>
              <input name="lanIp" type="text" value="${cfg.lanIp}" placeholder="192.168.1.1" />
            </label>
            <label class="field">
              <span>サブネットマスク</span>
              <input name="subnetMask" type="text" value="${cfg.subnetMask}" placeholder="255.255.255.0" />
            </label>
            <label class="field field--checkbox">
              <input name="dhcpEnabled" type="checkbox" ${cfg.dhcpEnabled ? "checked" : ""} data-toggle="dhcp-fields" />
              <span>DHCPを有効にする</span>
            </label>
            <div class="dhcp-fields" ${cfg.dhcpEnabled ? "" : "hidden"}>
              <label class="field">
                <span>DHCP範囲（開始）</span>
                <input name="dhcpStart" type="text" value="${cfg.dhcpStart}" placeholder="192.168.1.100" />
              </label>
              <label class="field">
                <span>DHCP範囲（終了）</span>
                <input name="dhcpEnd" type="text" value="${cfg.dhcpEnd}" placeholder="192.168.1.200" />
              </label>
            </div>
            <label class="field field--checkbox">
              <input name="natEnabled" type="checkbox" ${cfg.natEnabled ? "checked" : ""} />
              <span>NATを有効にする</span>
            </label>
            <button type="button" class="save-btn" data-save-router="${device.id}">保存</button>
          </form>
        </div>
      </div>`;
    }

    const cfg = (device.networkConfig as ClientConfig) ?? { dhcpEnabled: true };
    const resolved = resolveAllConfigs(this.state).get(device.id);
    const dhcpStatusHtml = resolved?.ip
      ? `
        <div class="dhcp-status-row"><span>IPアドレス</span><span>${resolved.ip}</span></div>
        <div class="dhcp-status-row"><span>サブネットマスク</span><span>${resolved.subnetMask ?? "-"}</span></div>
        <div class="dhcp-status-row"><span>デフォルトゲートウェイ</span><span>${resolved.gateway ?? "-"}</span></div>
        <div class="dhcp-status-row"><span>DNS</span><span>${resolved.dns ?? "-"}</span></div>
      `
      : `<div class="dhcp-status-empty">まだIPアドレスを取得できていません（ルーターまでの配線とDHCP設定を確認してください）。</div>`;
    return `<div class="overlay" data-overlay="settings">
      <div class="sheet">
        <div class="sheet-header"><h2>⚙ ${device.name} の設定</h2><button class="close-btn" data-close="settings">✕</button></div>
        <form id="settings-form" class="settings-form">
          <label class="field field--checkbox">
            <input name="dhcpEnabled" type="checkbox" ${cfg.dhcpEnabled ? "checked" : ""} data-toggle="manual-fields" data-invert="1" data-toggle-show="dhcp-status" />
            <span>IPアドレスを自動取得する（DHCP）</span>
          </label>
          <div class="dhcp-status" ${cfg.dhcpEnabled ? "" : "hidden"}>${dhcpStatusHtml}</div>
          <div class="manual-fields" ${cfg.dhcpEnabled ? "hidden" : ""}>
            <label class="field">
              <span>IPアドレス</span>
              <input name="ip" type="text" value="${cfg.ip ?? ""}" placeholder="192.168.1.10" />
            </label>
            <label class="field">
              <span>サブネットマスク</span>
              <input name="subnetMask" type="text" value="${cfg.subnetMask ?? ""}" placeholder="255.255.255.0" />
            </label>
            <label class="field">
              <span>デフォルトゲートウェイ</span>
              <input name="gateway" type="text" value="${cfg.gateway ?? ""}" placeholder="192.168.1.1" />
            </label>
            <label class="field">
              <span>DNS</span>
              <input name="dns" type="text" value="${cfg.dns ?? ""}" placeholder="192.168.1.1" />
            </label>
          </div>
          ${this.renderPortToggles(device)}
          <button type="button" class="save-btn" data-save-client="${device.id}">保存</button>
        </form>
      </div>
    </div>`;
  }

  private renderDiagnosis(): string {
    if (!this.ui.showDiagnosis || !this.ui.diagnosisDeviceId) return "";
    const device = deviceById(this.state, this.ui.diagnosisDeviceId);
    if (!device) return "";
    const diag = diagnoseDevice(this.state, device.id);
    const p = this.ui.pingResult;
    return `<div class="overlay" data-overlay="diagnosis">
      <div class="sheet">
        <div class="sheet-header"><h2>🔍 ${device.name} の診断</h2><button class="close-btn" data-close="diagnosis">✕</button></div>
        <div class="diag-list">
          ${diag.steps
            .map(
              (s) => `<div class="diag-row diag-row--${s.status}">
                <div class="diag-row-title">${STEP_ICON[s.status]} ${s.label}</div>
                ${s.detail ? `<div class="diag-row-detail">${s.detail}</div>` : ""}
              </div>`
            )
            .join("")}
        </div>
        <div class="ping-tool">
          <div class="ping-label">📶 Ping</div>
          <div class="ping-row">
            <input id="ping-input" type="text" placeholder="192.168.1.1" value="${this.ui.pingTarget}" />
            <button class="ping-btn" data-ping="${device.id}">実行</button>
          </div>
          ${
            p
              ? `<div class="ping-result ${p.success ? "ping-result--ok" : "ping-result--ng"}">${p.message}</div>`
              : ""
          }
        </div>
      </div>
    </div>`;
  }

  private renderInspection(): string {
    if (!this.ui.showInspection || !this.ui.inspectionDeviceId) return "";
    const device = deviceById(this.state, this.ui.inspectionDeviceId);
    if (!device) return "";
    const room = this.roomFor(device);

    const vlanCapable = isVlanCapable(device.type);
    const portRows = device.ports
      .map((port) => {
        const vlanInfo = vlanCapable ? `<br>VLAN：${this.portVlanSummary(port)}` : "";
        const conn = this.state.connections.find(
          (c) =>
            (c.fromDevice === device.id && c.fromPort === port.id) ||
            (c.toDevice === device.id && c.toPort === port.id)
        );
        if (!conn) {
          return `<div class="inspect-port">
            <div class="inspect-port-name">${port.type}ポート ${port.status === "down" ? "（無効）" : ""}</div>
            <div class="inspect-port-detail">空き${vlanInfo}</div>
          </div>`;
        }
        const otherId = conn.fromDevice === device.id ? conn.toDevice : conn.fromDevice;
        const other = deviceById(this.state, otherId);
        let cableInfo = "接続先の情報が取得できません。";
        if (other && device.x !== null && device.y !== null && other.x !== null && other.y !== null) {
          if (conn.kind === "wifi") {
            const signal = wifiSignalBetween(this.state, device.x, device.y, other.x, other.y);
            const wallInfo = signal.crossedRoomNames.length > 0 ? `（${signal.crossedRoomNames.join("・")}の壁を通過）` : "";
            cableInfo = `種類：無線（Wi-Fi） / 電波強度：${wifiSignalLabel(signal)}${wallInfo}`;
          } else {
            const len = cableLengthMeters(device.x, device.y, other.x, other.y);
            cableInfo = `規格：Cat6 / 長さ：${len.toFixed(1)}m${isCableTooLong(len) ? "（上限オーバー）" : ""}`;
          }
        }
        return `<div class="inspect-port">
          <div class="inspect-port-name">${port.type}ポート ${port.status === "down" ? "（無効）" : ""}</div>
          <div class="inspect-port-detail">接続先：${other ? other.name : "不明"}<br>${cableInfo}${vlanInfo}</div>
        </div>`;
      })
      .join("");

    return `<div class="overlay" data-overlay="inspection">
      <div class="sheet">
        <div class="sheet-header"><h2>🔍 ${device.name} の現場調査</h2><button class="close-btn" data-close="inspection">✕</button></div>
        <div class="inspect-summary">
          <div>機器種別：${shortLabel(device.type)}</div>
          ${room ? `<div>設置場所：${room}</div>` : ""}
          ${device.power !== undefined ? `<div>電源：${device.power === "on" ? "ON" : "OFF"}</div>` : ""}
        </div>
        <div class="inspect-ports">${portRows}</div>
      </div>
    </div>`;
  }

  private renderJobLetter(): string {
    if (!this.ui.showJobLetter) return "";
    const mission = currentMission(this.state);
    return `<div class="overlay" data-overlay="jobletter">
      <div class="sheet">
        <div class="sheet-header"><h2>📩 依頼内容</h2><button class="close-btn" data-close="jobletter">✕</button></div>
        <div class="job-letter">
          <div class="job-letter-client">${mission.client}</div>
          <div class="job-letter-body">${mission.description}</div>
          <ul class="job-letter-reqs">
            ${mission.requirements.map((r) => `<li>${r}</li>`).join("")}
          </ul>
          <div class="job-letter-meta">
            <span>📅 ${mission.deadline}</span>
            <span>💰 ${mission.budgetHint}</span>
          </div>
        </div>
      </div>
    </div>`;
  }

  private renderHelpdesk(): string {
    if (!this.ui.showHelpdesk) return "";
    const ticket = this.ui.helpdeskTicketId
      ? this.state.tickets.find((t) => t.id === this.ui.helpdeskTicketId)
      : null;

    if (ticket) {
      const employee = employeeById(ticket.employeeId);
      const device = ticket.relatedDeviceId ? deviceById(this.state, ticket.relatedDeviceId) : null;
      const canResolve = ticket.status !== "解決" && (!device || diagnoseDevice(this.state, device.id).success);
      return `<div class="overlay" data-overlay="helpdesk">
        <div class="sheet">
          <button class="book-back" data-helpdesk-back="1">← チケット一覧</button>
          <div class="sheet-header"><h2>🎫 ${ticket.subject}</h2><button class="close-btn" data-close="helpdesk">✕</button></div>
          <div class="ticket-detail-meta">
            <span class="ticket-priority ticket-priority--${ticket.priority}">${ticket.priority}</span>
            <span class="ticket-status">${ticket.status}</span>
          </div>
          <div class="ticket-detail-employee">
            ${employee ? `${employee.name}さん（${employee.department}・${employee.position}）` : "不明な社員"}からの問い合わせ
          </div>
          <div class="ticket-detail-desc">${ticket.description}</div>
          ${device ? `<div class="ticket-detail-device">対象機器：${device.name}</div>` : ""}
          ${
            ticket.status === "解決"
              ? `<div class="ticket-resolved-banner">✅ 対応完了（報酬 ${money(ticket.reward)} 受領済み）</div>`
              : `<div class="ticket-detail-actions">
                  ${
                    device
                      ? `<button class="save-btn" data-ticket-goto-device="${device.id}">🔍 現場で確認する</button>`
                      : ""
                  }
                  <button class="save-btn" data-ticket-resolve="${ticket.id}" ${canResolve ? "" : "disabled"}>
                    対応完了にする
                  </button>
                  ${
                    device && !canResolve
                      ? `<div class="ticket-hint">まだ${device.name}が正常に通信できていません。🔍調査で原因を確認しましょう。</div>`
                      : ""
                  }
                </div>`
          }
        </div>
      </div>`;
    }

    const onlineCount = runCommunicationTest(this.state).filter((r) => r.success).length;
    const open = openTicketCount(this.state);
    const rows = this.state.tickets
      .slice()
      .reverse()
      .map((t) => {
        const employee = employeeById(t.employeeId);
        return `<button class="ticket-row ticket-row--${t.status === "解決" ? "done" : "open"}" data-helpdesk-open="${t.id}">
          <div class="ticket-row-top">
            <span class="ticket-priority ticket-priority--${t.priority}">${t.priority}</span>
            <span class="ticket-status">${t.status}</span>
          </div>
          <div class="ticket-row-subject">${t.subject}</div>
          <div class="ticket-row-employee">${employee ? `${employee.name}さん（${employee.department}）` : ""}</div>
        </button>`;
      })
      .join("");
    return `<div class="overlay" data-overlay="helpdesk">
      <div class="sheet">
        <div class="sheet-header"><h2>🎫 ヘルプデスク</h2><button class="close-btn" data-close="helpdesk">✕</button></div>
        <div class="helpdesk-stats">
          <div><span>社員数</span><span>${EMPLOYEES.length}人</span></div>
          <div><span>稼働PC/サーバー</span><span>${onlineCount}台</span></div>
          <div><span>未処理チケット</span><span>${open}件</span></div>
        </div>
        ${rows || `<div class="helpdesk-empty">現在チケットはありません。</div>`}
      </div>
    </div>`;
  }

  private renderBook(): string {
    if (!this.ui.showBook) return "";
    let inner: string;
    const page = this.ui.bookPageId ? findBookPage(this.ui.bookPageId) : null;
    if (page) {
      inner = `
        <button class="book-back" data-book-back="category">← ${page.category.title}</button>
        <h3 class="book-page-title">${page.page.icon} ${page.page.title}</h3>
        <div class="book-section"><div class="book-section-label">① これは何？</div><div>${page.page.what}</div></div>
        <div class="book-section"><div class="book-section-label">② 現実では？</div><div>${page.page.reality}</div></div>
        <div class="book-section"><div class="book-section-label">③ ゲームでは？</div><div>${page.page.inGame}</div></div>
        <div class="book-section"><div class="book-section-label">④ 構成例</div><pre class="book-example">${page.page.example}</pre></div>
        ${
          page.page.practiceMode
            ? `<button class="save-btn" data-book-practice="${page.page.practiceMode}">🔧 この画面で試してみる</button>`
            : ""
        }
      `;
    } else if (this.ui.bookCategoryId) {
      const category = BOOK_CATEGORIES.find((c) => c.id === this.ui.bookCategoryId);
      inner = `
        <button class="book-back" data-book-back="root">← カテゴリ一覧</button>
        <div class="book-page-list">
          ${
            category?.pages
              .map((p) => `<button class="book-page-item" data-book-page="${p.id}"><span>${p.icon}</span>${p.title}</button>`)
              .join("") ?? ""
          }
        </div>
      `;
    } else {
      inner = `
        <div class="book-category-list">
          ${BOOK_CATEGORIES.map(
            (c) => `<button class="book-category-item" data-book-category="${c.id}"><span>${c.icon}</span>${c.title}</button>`
          ).join("")}
        </div>
      `;
    }
    return `<div class="overlay" data-overlay="book">
      <div class="sheet sheet--tall">
        <div class="sheet-header"><h2>📖 説明ブック</h2><button class="close-btn" data-close="book">✕</button></div>
        ${inner}
      </div>
    </div>`;
  }

  /** V7.1建物再構築の Phase 1（design doc §22）専用プレビュー。ユーザー提供の間取り図
   * をベクター化（SVG）したデータから直接抽出した建物外形（Phase 1）と壁（Phase 2）を
   * 並べて表示するだけで、既存の部屋・機器・案件データには一切触れていない（design doc
   * §24）。部屋・ドア・窓・家具などはPhase 3以降でここに積み上げていく。 */
  private renderBuildingOutline(): string {
    if (!this.ui.showBuildingOutline) return "";
    const door = (d: DoorMarker) => {
      const half = d.length / 2;
      const [x1, y1, x2, y2] = d.vertical ? [d.x, d.y - half, d.x, d.y + half] : [d.x - half, d.y, d.x + half, d.y];
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="building-outline-door" />`;
    };
    const stair = (s: StairArrow) => `<g transform="translate(${s.x},${s.y}) rotate(${s.angleDeg})" class="building-outline-stair">
      <line x1="-15" y1="0" x2="15" y2="0" />
      <path d="M 15,0 L 4,-7 L 4,7 Z" />
    </g>`;
    const panel = (outline: (typeof BUILDING_OUTLINES)[number]) => {
      const pad = 12;
      const { width, height } = outline.viewBox;
      const gid = outline.id;
      return `<div class="building-outline-panel">
        <div class="building-outline-label">${outline.label}</div>
        <svg viewBox="${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}" class="building-outline-svg">
          <defs>
            <pattern id="wood-${gid}" width="132" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(3)">
              <rect width="132" height="48" fill="#352c1f" />
              <rect x="0" y="0" width="130" height="22" fill="#3d3222" />
              <rect x="66" y="24" width="130" height="22" fill="#39301f" />
              <rect x="-66" y="24" width="130" height="22" fill="#3b3221" />
              <g stroke="#1c160e" stroke-width="1" opacity="0.7">
                <line x1="0" y1="0" x2="132" y2="0" />
                <line x1="0" y1="24" x2="132" y2="24" />
                <line x1="66" y1="24" x2="66" y2="48" />
                <line x1="0" y1="0" x2="0" y2="24" />
              </g>
              <g stroke="#5a4a30" stroke-width="0.6" opacity="0.35">
                <line x1="8" y1="3" x2="120" y2="5" />
                <line x1="14" y1="12" x2="118" y2="10" />
                <line x1="10" y1="18" x2="122" y2="19" />
                <line x1="74" y1="27" x2="186" y2="29" />
                <line x1="80" y1="36" x2="184" y2="34" />
                <line x1="76" y1="42" x2="188" y2="43" />
              </g>
            </pattern>
            <filter id="grain-${gid}" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence type="fractalNoise" baseFrequency="0.012 0.28" numOctaves="3" seed="11" result="n" />
              <feColorMatrix
                in="n"
                type="matrix"
                values="0 0 0 0 0.12  0 0 0 0 0.08  0 0 0 0 0.04  0 0 0 0.55 0"
              />
            </filter>
            <radialGradient id="light-${gid}" cx="20%" cy="10%" r="90%">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0.16" />
              <stop offset="45%" stop-color="#ffffff" stop-opacity="0.05" />
              <stop offset="100%" stop-color="#000000" stop-opacity="0.22" />
            </radialGradient>
            <clipPath id="clip-${gid}">
              <path d="${outline.outlinePath}" />
            </clipPath>
          </defs>
          <path d="${outline.outlinePath}" fill="url(#wood-${gid})" class="building-outline-shape" />
          <g clip-path="url(#clip-${gid})">
            <rect
              x="${-pad}"
              y="${-pad}"
              width="${width + pad * 2}"
              height="${height + pad * 2}"
              filter="url(#grain-${gid})"
              class="building-outline-grain"
            />
            <path d="${outline.wallsPath}" class="building-outline-wall-shadow" />
          </g>
          <path d="${outline.wallsPath}" class="building-outline-walls" />
          <path d="${outline.pillarsPath}" class="building-outline-pillar-shadow" />
          <path d="${outline.pillarsPath}" class="building-outline-pillars" />
          ${outline.doors.map(door).join("")}
          ${outline.stairs.map(stair).join("")}
          <rect x="${-pad}" y="${-pad}" width="${width + pad * 2}" height="${height + pad * 2}" fill="url(#light-${gid})" class="building-outline-light" />
        </svg>
      </div>`;
    };
    return `<div class="overlay" data-overlay="buildingOutline">
      <div class="sheet sheet--tall">
        <div class="sheet-header">
          <h2>🏛 建物外形・壁・ドア・階段（下書き・Phase 1-3）</h2>
          <button class="close-btn" data-close="buildingOutline">✕</button>
        </div>
        <p class="building-outline-note">
          ユーザー提供の間取り図をベクター化したデータから直接抽出した、本庁舎・別館の
          外形（Phase 1）と壁（Phase 2、太さのある二重線として表示）です。ドア（赤い短い
          線）と階段の上り方向（オレンジの矢印）は、ユーザーが元図面に直接書き込んだ位置を
          そのまま反映しています（Phase 3）。まだ部屋・窓・家具は含まれていません
          （design doc §22）。実際の図面とずれている箇所があれば教えてください。
        </p>
        <div class="building-outline-grid">
          ${BUILDING_OUTLINES.map(panel).join("")}
        </div>
      </div>
    </div>`;
  }

  private renderTest(): string {
    if (!this.ui.showTest) return "";
    const results = this.ui.testResults;
    const successCount = results.filter((r) => r.success).length;
    const mission = currentMission(this.state);
    const missionCheck = mission.check(this.state);
    return `<div class="overlay" data-overlay="test">
      <div class="sheet">
        <div class="sheet-header"><h2>🔎 通信テスト</h2><button class="close-btn" data-close="test">✕</button></div>
        <div class="test-summary">通信成功: ${successCount} / ${results.length || 0}</div>
        <div class="test-list">
          ${
            results.length === 0
              ? `<div class="test-empty">PC・サーバーが配置されていません。</div>`
              : results
                  .map((r) => {
                    const firstFail = r.steps.find((s) => s.status === "fail");
                    return `<div class="test-row ${r.success ? "test-row--ok" : "test-row--ng"}">
                      <div class="test-row-title">${r.success ? "✅" : "❌"} ${r.name}</div>
                      ${
                        firstFail
                          ? `<div class="test-row-reason">${firstFail.label}：${firstFail.detail}</div>`
                          : r.success
                            ? `<div class="test-row-path">インターネットに到達できています。</div>`
                            : ""
                      }
                    </div>`;
                  })
                  .join("")
          }
        </div>
        ${
          missionCheck.ok
            ? `<div class="clear-banner">
                🎉 ${mission.title} の達成条件を満たしました！
                <button class="claim-btn" data-claim="1">報酬を受け取る</button>
              </div>`
            : `<div class="mission-hint">🎯 ${mission.title}：${missionCheck.detail ?? ""}</div>`
        }
      </div>
    </div>`;
  }

  private renderClear(): string {
    if (!this.ui.showClear) return "";
    const mission = currentMission(this.state);
    const hasNext = this.state.missionIndex < MISSIONS.length - 1;
    const totalCableLength = this.state.connections.reduce((sum, c) => {
      const a = deviceById(this.state, c.fromDevice);
      const b = deviceById(this.state, c.toDevice);
      if (!a || !b || a.x === null || a.y === null || b.x === null || b.y === null) return sum;
      return sum + cableLengthMeters(a.x, a.y, b.x, b.y);
    }, 0);
    const totalSpent = this.state.devices
      .filter((d) => d.type !== "internet")
      .reduce((sum, d) => sum + d.price, 0);
    const budgetMatch = mission.budgetHint.match(/¥([\d,]+)/);
    const budgetAmount = budgetMatch ? Number(budgetMatch[1].replace(/,/g, "")) : null;
    const testResults = runCommunicationTest(this.state);
    const successRate =
      testResults.length > 0 ? Math.round((testResults.filter((r) => r.success).length / testResults.length) * 100) : 100;
    return `<div class="overlay" data-overlay="clear">
      <div class="clear-screen">
        <div class="clear-title">🎉 案件完了！</div>
        <div class="clear-sub">${mission.client} 様より、${mission.title}の完了確認をいただきました。</div>
        <div class="clear-stats">
          <div>報酬：${money(mission.reward)}</div>
          <div>通信成功率：${successRate}%（${testResults.filter((r) => r.success).length}/${testResults.length}台）</div>
          <div>施工コスト：${money(totalSpent)}${budgetAmount !== null ? ` / ${money(budgetAmount)}` : ""}</div>
          <div>配線距離：${totalCableLength.toFixed(1)}m</div>
          <div>配線ミス：${this.state.wiringMistakes}件</div>
        </div>
        <div class="clear-requirements">
          <div class="clear-requirements-label">顧客要求</div>
          ${mission.requirements.map((r) => `<div class="clear-requirement">✅ ${r}</div>`).join("")}
        </div>
        ${
          hasNext
            ? `<button class="close-btn2" data-next-mission="1">次の依頼へ</button>`
            : `<div class="clear-final">すべての依頼が完了しました！お疲れさまでした。</div><button class="close-btn2" data-close="clear">とじる</button>`
        }
      </div>
    </div>`;
  }

  private render() {
    const s = this.state;
    const mission = currentMission(s);
    // Every state change re-renders the whole shell (innerHTML replace), which would
    // otherwise reset the map's scroll position back to the top-left on every tap.
    const prevOfficeWrap = this.root.querySelector<HTMLElement>(".office-wrap");
    const scrollTop = prevOfficeWrap?.scrollTop ?? 0;
    const scrollLeft = prevOfficeWrap?.scrollLeft ?? 0;
    this.root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="topbar-money">💰 ${money(s.money)}</div>
          <button class="topbar-mission" data-job-letter="1" title="依頼内容を確認">
            <div class="mission-title">📩 ${mission.title}${s.missionCleared[mission.id] ? "（達成）" : ""}</div>
            <div class="mission-desc">${mission.description}</div>
          </button>
          <button class="book-btn" data-book="1" title="説明ブック">📖</button>
          <button class="book-btn" data-building-outline="1" title="建物外形（下書き）">🏛</button>
          <button class="helpdesk-btn" data-helpdesk="1" title="ヘルプデスク">
            🎫${openTicketCount(s) > 0 ? `<span class="badge">${openTicketCount(s)}</span>` : ""}
          </button>
          <button class="reset-btn" data-reset="1" title="ゲームリセット">⟲</button>
        </header>

        <div class="mode-banner">${this.modeInstruction()}</div>

        <main class="office-wrap">
          <div class="office" id="office">
            ${this.renderRooms()}
            <svg class="cables-layer" viewBox="0 0 ${OFFICE_SIZE.width} ${OFFICE_SIZE.height}">
              ${this.renderCables()}
            </svg>
            ${this.renderOfficeDevices()}
          </div>
        </main>

        ${this.renderInventory()}

        <footer class="bottom-nav">
          <button class="nav-btn" data-shop="1"><span class="nav-icon">🛒</span><span class="nav-label">購入</span></button>
          <button class="nav-btn ${s.mode === "moving" ? "nav-btn--active" : ""}" data-mode="moving"><span class="nav-icon">🖐</span><span class="nav-label">移動</span></button>
          <button class="nav-btn ${s.mode === "connecting" ? "nav-btn--active" : ""}" data-mode="connecting"><span class="nav-icon">🔌</span><span class="nav-label">配線</span></button>
          <button class="nav-btn ${s.mode === "settings" ? "nav-btn--active" : ""}" data-mode="settings"><span class="nav-icon">⚙</span><span class="nav-label">設定</span></button>
          <button class="nav-btn ${s.mode === "diagnosing" ? "nav-btn--active" : ""}" data-mode="diagnosing"><span class="nav-icon">🔍</span><span class="nav-label">調査</span></button>
          <button class="nav-btn" data-test="1"><span class="nav-icon">▶</span><span class="nav-label">テスト</span></button>
        </footer>

        ${this.ui.toast ? `<div class="toast">${this.ui.toast}</div>` : ""}
        ${this.renderShop()}
        ${this.renderInfo()}
        ${this.renderCompareSelect()}
        ${this.renderCompare()}
        ${this.renderSettings()}
        ${this.renderDiagnosis()}
        ${this.renderInspection()}
        ${this.renderJobLetter()}
        ${this.renderHelpdesk()}
        ${this.renderBook()}
        ${this.renderBuildingOutline()}
        ${this.renderTest()}
        ${this.renderClear()}
      </div>
    `;

    const nextOfficeWrap = this.root.querySelector<HTMLElement>(".office-wrap");
    if (nextOfficeWrap) {
      nextOfficeWrap.scrollTop = scrollTop;
      nextOfficeWrap.scrollLeft = scrollLeft;
    }

    this.bindEvents();
  }

  private bindEvents() {
    const officeEl = this.root.querySelector<HTMLElement>("#office");
    officeEl?.addEventListener("click", (e) => this.handleOfficeClick(e, officeEl));

    this.root.querySelector('[data-reset="1"]')?.addEventListener("click", () => this.handleReset());
    this.root.querySelector('[data-shop="1"]')?.addEventListener("click", () => {
      this.ui.showShop = true;
      this.render();
    });
    this.root.querySelector('[data-test="1"]')?.addEventListener("click", () => this.handleRunTest());
    this.root.querySelector('[data-job-letter="1"]')?.addEventListener("click", () => {
      this.ui.showJobLetter = true;
      this.render();
    });
    this.root.querySelector('[data-book="1"]')?.addEventListener("click", () => {
      this.ui.showBook = true;
      this.render();
    });
    this.root.querySelector('[data-building-outline="1"]')?.addEventListener("click", () => {
      this.ui.showBuildingOutline = true;
      this.render();
    });
    this.root.querySelector('[data-helpdesk="1"]')?.addEventListener("click", () => this.handleOpenHelpdesk());

    this.root.querySelectorAll<HTMLElement>("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.setMode(btn.dataset.mode as GameMode);
        this.render();
      });
    });

    const closeOverlay = (which: string | null | undefined) => {
      if (which === "shop") this.ui.showShop = false;
      if (which === "settings") this.ui.showSettings = false;
      if (which === "diagnosis") this.ui.showDiagnosis = false;
      if (which === "inspection") this.ui.showInspection = false;
      if (which === "jobletter") this.ui.showJobLetter = false;
      if (which === "helpdesk") this.ui.showHelpdesk = false;
      if (which === "book") this.ui.showBook = false;
      if (which === "test") this.ui.showTest = false;
      if (which === "clear") this.ui.showClear = false;
      if (which === "info") this.ui.showInfo = false;
      if (which === "compareSelect") this.ui.showCompareSelect = false;
      if (which === "compare") this.ui.showCompare = false;
      if (which === "buildingOutline") this.ui.showBuildingOutline = false;
    };

    this.root.querySelectorAll<HTMLElement>("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        closeOverlay(btn.dataset.close);
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLElement>(".overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          closeOverlay(overlay.getAttribute("data-overlay"));
          this.render();
        }
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-buy]").forEach((btn) => {
      btn.addEventListener("click", () => this.handleBuy(btn.dataset.buy as DeviceType));
    });

    this.root.querySelectorAll<HTMLElement>("[data-unplaced-id]").forEach((btn) => {
      btn.addEventListener("click", () => this.handleSelectUnplaced(btn.dataset.unplacedId!));
    });

    this.root.querySelectorAll<HTMLElement>("[data-info-catalog]").forEach((btn) => {
      btn.addEventListener("click", () => this.openInfoForCatalog(btn.dataset.infoCatalog as DeviceType));
    });
    this.root.querySelectorAll<HTMLElement>("[data-info-device]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        // These buttons can sit inside a placed device's tile (which itself is a
        // click target for placing/moving/connecting via the delegated #office
        // listener) - stop the click from also being interpreted as a mode action.
        e.stopPropagation();
        this.openInfoForDevice(btn.dataset.infoDevice!);
      });
    });
    this.root.querySelector<HTMLElement>("[data-open-compare-select]")?.addEventListener("click", () =>
      this.handleOpenCompareSelect()
    );
    this.root.querySelectorAll<HTMLInputElement>("[data-compare-select-toggle]").forEach((checkbox) => {
      checkbox.addEventListener("change", () =>
        this.handleToggleCompareSelect(checkbox.dataset.compareSelectToggle as DeviceType)
      );
    });
    this.root.querySelector<HTMLElement>("[data-open-compare]")?.addEventListener("click", () =>
      this.handleOpenCompare()
    );
    this.root.querySelector<HTMLElement>("[data-info-goto-settings]")?.addEventListener("click", (e) => {
      this.handleInfoGotoSettings((e.currentTarget as HTMLElement).dataset.infoGotoSettings!);
    });
    this.root.querySelector<HTMLElement>("[data-back-to-info]")?.addEventListener("click", () => {
      this.ui.showCompareSelect = false;
      this.ui.showInfo = true;
      this.render();
    });

    this.root.querySelectorAll<HTMLElement>("[data-helpdesk-open]").forEach((btn) => {
      btn.addEventListener("click", () => this.handleOpenTicket(btn.dataset.helpdeskOpen!));
    });
    this.root.querySelector<HTMLElement>("[data-helpdesk-back]")?.addEventListener("click", () => {
      this.ui.helpdeskTicketId = null;
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-ticket-goto-device]")?.addEventListener("click", (e) => {
      this.handleTicketGotoDevice((e.currentTarget as HTMLElement).dataset.ticketGotoDevice!);
    });
    this.root.querySelector<HTMLElement>("[data-ticket-resolve]")?.addEventListener("click", (e) => {
      this.handleResolveTicket((e.currentTarget as HTMLElement).dataset.ticketResolve!);
    });

    this.root.querySelector('[data-claim="1"]')?.addEventListener("click", () => this.handleClaimReward());
    this.root.querySelector('[data-next-mission="1"]')?.addEventListener("click", () => this.handleNextMission());

    // Settings form: toggle visibility of dependent fields purely via DOM (no re-render, keeps focus).
    this.root.querySelectorAll<HTMLInputElement>("[data-toggle]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const targetClass = checkbox.dataset.toggle!;
        const container = this.root.querySelector<HTMLElement>(`.${targetClass}`);
        if (!container) return;
        const invert = checkbox.dataset.invert === "1";
        const show = invert ? !checkbox.checked : checkbox.checked;
        container.hidden = !show;
      });
    });

    // Same checkbox can also show/hide a second, non-inverted container (e.g. the
    // DHCP checkbox reveals "manual-fields" when off and "dhcp-status" when on).
    this.root.querySelectorAll<HTMLInputElement>("[data-toggle-show]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const container = this.root.querySelector<HTMLElement>(`.${checkbox.dataset.toggleShow!}`);
        if (container) container.hidden = !checkbox.checked;
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-save-router]").forEach((btn) => {
      btn.addEventListener("click", () => this.saveRouterSettings(btn.dataset.saveRouter!));
    });
    this.root.querySelectorAll<HTMLElement>("[data-save-client]").forEach((btn) => {
      btn.addEventListener("click", () => this.saveClientSettings(btn.dataset.saveClient!));
    });
    this.root.querySelectorAll<HTMLElement>("[data-save-l3switch]").forEach((btn) => {
      btn.addEventListener("click", () => this.saveL3SwitchSettings(btn.dataset.saveL3switch!));
    });

    this.root.querySelector<HTMLElement>("[data-ping]")?.addEventListener("click", () => this.handleRunPing());

    this.root.querySelectorAll<HTMLInputElement>("[data-power-toggle]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        togglePower(this.state, checkbox.dataset.powerToggle!);
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLInputElement>("[data-port-fault-toggle]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const [deviceId, portId] = checkbox.dataset.portFaultToggle!.split(":");
        setPortStatus(this.state, deviceId, portId, checkbox.checked ? "up" : "down");
        this.render();
      });
    });

    this.root.querySelector<HTMLElement>("[data-add-vlan]")?.addEventListener("click", () => this.handleAddVlan());

    this.root.querySelectorAll<HTMLSelectElement>("[data-port-vlan-mode]").forEach((select) => {
      select.addEventListener("change", () => {
        const [deviceId, portId] = select.dataset.portVlanMode!.split(":");
        this.handlePortVlanModeChange(deviceId, portId, select.value as "access" | "trunk");
      });
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-port-access-vlan]").forEach((select) => {
      select.addEventListener("change", () => {
        const [deviceId, portId] = select.dataset.portAccessVlan!.split(":");
        this.handlePortAccessVlanChange(deviceId, portId, Number(select.value));
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-port-trunk-vlan]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const [deviceId, portId, vlanId] = checkbox.dataset.portTrunkVlan!.split(":");
        this.handlePortTrunkVlanToggle(deviceId, portId, Number(vlanId), checkbox.checked);
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-book-category]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.ui.bookCategoryId = btn.dataset.bookCategory!;
        this.ui.bookPageId = null;
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLElement>("[data-book-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.ui.bookPageId = btn.dataset.bookPage!;
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLElement>("[data-book-back]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.bookBack === "root") {
          this.ui.bookCategoryId = null;
        }
        this.ui.bookPageId = null;
        this.render();
      });
    });
    this.root.querySelector<HTMLElement>("[data-book-practice]")?.addEventListener("click", (e) => {
      const mode = (e.currentTarget as HTMLElement).dataset.bookPractice as GameMode;
      this.ui.showBook = false;
      this.state.mode = mode;
      this.state.selectedDeviceId = null;
      this.state.connectFromId = null;
      this.render();
    });
  }
}
