import { cableLengthMeters } from "./cables";
import { DEVICE_CATALOG, iconFor } from "./devices";
import { diagnoseDevice, ping, runCommunicationTest } from "./diagnostics";
import { currentMission, MISSIONS } from "./missions";
import { isValidIp } from "./netutils";
import {
  OFFICE_SIZE,
  buyDevice,
  connectDevices,
  deviceById,
  disconnectCable,
  moveDevice,
  placeDevice,
  placedDevices,
  portUsageCount,
  resetState,
  togglePower,
  unplacedDevices,
  updateClientConfig,
  updateRouterConfig,
} from "./state";
import type {
  ClientConfig,
  Device,
  DeviceDiagnosis,
  DeviceType,
  GameMode,
  GameState,
  PingResult,
  RouterConfig,
} from "./types";

interface UiState {
  showShop: boolean;
  showTest: boolean;
  showClear: boolean;
  showSettings: boolean;
  showDiagnosis: boolean;
  settingsDeviceId: string | null;
  diagnosisDeviceId: string | null;
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
    settingsDeviceId: null,
    diagnosisDeviceId: null,
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

  private handleSelectUnplaced(id: string) {
    this.state.mode = "placing";
    this.state.selectedDeviceId = this.state.selectedDeviceId === id ? null : id;
    this.render();
  }

  private static readonly SETTINGS_TYPES: DeviceType[] = [
    "router",
    "pc",
    "server",
    "switch4",
    "switch8",
    "onu",
    "wifi",
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
      if (device.type === "pc" || device.type === "server") {
        this.ui.diagnosisDeviceId = device.id;
        this.ui.showDiagnosis = true;
        this.ui.pingResult = null;
        this.render();
      } else {
        this.setToast("PCまたはサーバーを選んでください。");
      }
    }
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
        return "診断したいPCまたはサーバーをタップしてください。";
      default:
        return "🛒購入・🖐移動・🔌配線・⚙設定・🔍診断・▶テストで操作しよう。";
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
          `<div class="room" style="left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px">
            <span class="room-label">${r.name}</span>
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
        const tooLong = cableLengthMeters(a.x, a.y, b.x, b.y) > 100;
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
            (d) => `<button class="chip ${
              d.id === this.state.selectedDeviceId ? "chip--selected" : ""
            }" data-unplaced-id="${d.id}">
              <span class="chip-icon">${iconFor(d.type)}</span>${d.name}
            </button>`
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
        <div class="shop-list">
          ${DEVICE_CATALOG.map(
            (item) => `<div class="shop-item">
              <div class="shop-item-icon">${item.icon}</div>
              <div class="shop-item-info">
                <div class="shop-item-name">${item.label}</div>
                <div class="shop-item-desc">${item.description}</div>
                <div class="shop-item-price">${money(item.price)}</div>
              </div>
              <button class="buy-btn" data-buy="${item.type}" ${
                this.state.money < item.price ? "disabled" : ""
              }>購入</button>
            </div>`
          ).join("")}
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

  private renderSettings(): string {
    if (!this.ui.showSettings || !this.ui.settingsDeviceId) return "";
    const device = deviceById(this.state, this.ui.settingsDeviceId);
    if (!device) return "";

    if (device.type === "switch4" || device.type === "switch8" || device.type === "onu" || device.type === "wifi") {
      return `<div class="overlay" data-overlay="settings">
        <div class="sheet">
          <div class="sheet-header"><h2>⚙ ${device.name} の設定</h2><button class="close-btn" data-close="settings">✕</button></div>
          <form class="settings-form">
            ${this.renderPowerToggle(device)}
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
    return `<div class="overlay" data-overlay="settings">
      <div class="sheet">
        <div class="sheet-header"><h2>⚙ ${device.name} の設定</h2><button class="close-btn" data-close="settings">✕</button></div>
        <form id="settings-form" class="settings-form">
          <label class="field field--checkbox">
            <input name="dhcpEnabled" type="checkbox" ${cfg.dhcpEnabled ? "checked" : ""} data-toggle="manual-fields" data-invert="1" />
            <span>IPアドレスを自動取得する（DHCP）</span>
          </label>
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
    return `<div class="overlay" data-overlay="clear">
      <div class="clear-screen">
        <div class="clear-title">🎉 MISSION COMPLETE!</div>
        <div class="clear-sub">${mission.title}：クリア！</div>
        <div class="clear-stats">
          <div>報酬：${money(mission.reward)}</div>
          <div>配線距離：${totalCableLength.toFixed(1)}m</div>
          <div>施工コスト：${money(totalSpent)}</div>
        </div>
        ${
          hasNext
            ? `<button class="close-btn2" data-next-mission="1">次のミッションへ</button>`
            : `<div class="clear-final">全ミッションクリア！お疲れさまでした。</div><button class="close-btn2" data-close="clear">とじる</button>`
        }
      </div>
    </div>`;
  }

  private render() {
    const s = this.state;
    const mission = currentMission(s);
    this.root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="topbar-money">💰 ${money(s.money)}</div>
          <div class="topbar-mission">
            <div class="mission-title">${mission.title}${s.missionCleared[mission.id] ? "（達成）" : ""}</div>
            <div class="mission-desc">${mission.description}</div>
          </div>
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
          <button class="nav-btn ${s.mode === "diagnosing" ? "nav-btn--active" : ""}" data-mode="diagnosing"><span class="nav-icon">🔍</span><span class="nav-label">診断</span></button>
          <button class="nav-btn" data-test="1"><span class="nav-icon">▶</span><span class="nav-label">テスト</span></button>
        </footer>

        ${this.ui.toast ? `<div class="toast">${this.ui.toast}</div>` : ""}
        ${this.renderShop()}
        ${this.renderSettings()}
        ${this.renderDiagnosis()}
        ${this.renderTest()}
        ${this.renderClear()}
      </div>
    `;

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

    this.root.querySelectorAll<HTMLElement>("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.setMode(btn.dataset.mode as GameMode);
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const which = btn.dataset.close;
        if (which === "shop") this.ui.showShop = false;
        if (which === "settings") this.ui.showSettings = false;
        if (which === "diagnosis") this.ui.showDiagnosis = false;
        if (which === "test") this.ui.showTest = false;
        if (which === "clear") this.ui.showClear = false;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLElement>(".overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          const which = overlay.getAttribute("data-overlay");
          if (which === "shop") this.ui.showShop = false;
          if (which === "settings") this.ui.showSettings = false;
          if (which === "diagnosis") this.ui.showDiagnosis = false;
          if (which === "test") this.ui.showTest = false;
          if (which === "clear") this.ui.showClear = false;
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

    this.root.querySelectorAll<HTMLElement>("[data-save-router]").forEach((btn) => {
      btn.addEventListener("click", () => this.saveRouterSettings(btn.dataset.saveRouter!));
    });
    this.root.querySelectorAll<HTMLElement>("[data-save-client]").forEach((btn) => {
      btn.addEventListener("click", () => this.saveClientSettings(btn.dataset.saveClient!));
    });

    this.root.querySelector<HTMLElement>("[data-ping]")?.addEventListener("click", () => this.handleRunPing());

    this.root.querySelectorAll<HTMLInputElement>("[data-power-toggle]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        togglePower(this.state, checkbox.dataset.powerToggle!);
        this.render();
      });
    });
  }
}
