import { DEVICE_CATALOG, iconFor } from "./devices";
import { runCommunicationTest, missionProgress, isMissionClear } from "./diagnostics";
import {
  OFFICE_SIZE,
  buyDevice,
  connectDevices,
  deviceById,
  moveDevice,
  placeDevice,
  placedDevices,
  resetState,
  unplacedDevices,
} from "./state";
import type { Device, GameMode, GameState, PcDiagnosis } from "./types";

interface UiState {
  showShop: boolean;
  showTest: boolean;
  showClear: boolean;
  toast: string | null;
  testResults: PcDiagnosis[];
}

function initialUi(): UiState {
  return {
    showShop: false,
    showTest: false,
    showClear: false,
    toast: null,
    testResults: [],
  };
}

const money = (v: number) => "¥" + v.toLocaleString("ja-JP");

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
    }, 2600);
  }

  private setMode(mode: GameMode) {
    this.state.mode = this.state.mode === mode ? "idle" : mode;
    this.state.selectedDeviceId = null;
    this.state.connectFromId = null;
  }

  private handleReset() {
    if (!window.confirm("ゲームをリセットしますか？購入・配置・接続がすべて消えます。")) {
      return;
    }
    this.state = resetState();
    this.ui = initialUi();
    this.render();
  }

  private handleBuy(type: Device["type"]) {
    if (type === "internet") return;
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

  private handleOfficeClick(evt: MouseEvent, officeEl: HTMLElement) {
    const target = evt.target as HTMLElement;
    const deviceEl = target.closest<HTMLElement>("[data-device-id]");
    const rect = officeEl.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

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
          this.state.selectedDeviceId =
            this.state.selectedDeviceId === id ? null : id;
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
      if (!result.ok) {
        this.setToast(result.reason ?? "接続できません。");
      } else {
        this.setToast("接続しました。");
      }
      this.state.connectFromId = null;
      this.render();
      return;
    }
  }

  private handleRunTest() {
    const results = runCommunicationTest(this.state);
    this.ui.testResults = results;
    this.ui.showTest = true;
    this.render();
  }

  private handleClaimReward() {
    if (!isMissionClear(this.state)) return;
    if (!this.state.missionCleared) {
      this.state.money += this.state.mission.reward;
      this.state.missionCleared = true;
    }
    this.ui.showTest = false;
    this.ui.showClear = true;
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
          ? "つなぎたい機器（B）をタップしてください。"
          : "つなぎたい機器（A）をタップしてください。";
      default:
        return "🛒購入・🖐移動・🔌接続・▶テストのボタンで操作しよう。";
    }
  }

  private renderOfficeDevices(): string {
    return placedDevices(this.state)
      .map((d) => {
        const selected =
          d.id === this.state.selectedDeviceId || d.id === this.state.connectFromId;
        return `<div class="device device--${d.type} ${selected ? "device--selected" : ""}"
          data-device-id="${d.id}"
          style="left:${d.x}px;top:${d.y}px">
          <div class="device-icon">${iconFor(d.type)}</div>
          <div class="device-label">${d.name}</div>
        </div>`;
      })
      .join("");
  }

  private renderCables(): string {
    const devices = placedDevices(this.state);
    const byId = new Map(devices.map((d) => [d.id, d]));
    return this.state.connections
      .map((c) => {
        const a = byId.get(c.fromId);
        const b = byId.get(c.toId);
        if (!a || !b) return "";
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="cable" />`;
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

  private renderTest(): string {
    if (!this.ui.showTest) return "";
    const results = this.ui.testResults;
    const successCount = results.filter((r) => r.success).length;
    const clear = isMissionClear(this.state);
    return `<div class="overlay" data-overlay="test">
      <div class="sheet">
        <div class="sheet-header">
          <h2>🔎 通信テスト</h2>
          <button class="close-btn" data-close="test">✕</button>
        </div>
        <div class="test-summary">接続成功: ${successCount} / ${results.length || 0}</div>
        <div class="test-list">
          ${
            results.length === 0
              ? `<div class="test-empty">PCが配置されていません。</div>`
              : results
                  .map(
                    (r) => `<div class="test-row ${r.success ? "test-row--ok" : "test-row--ng"}">
                      <div class="test-row-title">${r.success ? "✅" : "❌"} ${r.name}</div>
                      ${
                        r.success
                          ? `<div class="test-row-path">${r.path.join(" → ")}</div>`
                          : `<div class="test-row-reason">原因：${r.reason}</div>`
                      }
                    </div>`
                  )
                  .join("")
          }
        </div>
        ${
          clear
            ? `<div class="clear-banner">
                🎉 ミッション達成条件を満たしました！
                <button class="claim-btn" data-claim="1">報酬を受け取る</button>
              </div>`
            : ""
        }
      </div>
    </div>`;
  }

  private renderClear(): string {
    if (!this.ui.showClear) return "";
    const progress = missionProgress(this.state);
    return `<div class="overlay" data-overlay="clear">
      <div class="clear-screen">
        <div class="clear-title">🎉 NETWORK COMPLETE!</div>
        <div class="clear-sub">ネットワーク構築完了！</div>
        <div class="clear-stats">
          <div>接続PC：${progress.onlinePcCount} / ${this.state.mission.requiredPcCount}</div>
          <div>ルーター：${progress.routerCount}</div>
          <div>スイッチ：${progress.switchCount}</div>
          <div>通信状態：正常</div>
          <div>報酬：${money(this.state.mission.reward)}</div>
        </div>
        <button class="close-btn2" data-close="clear">とじる</button>
      </div>
    </div>`;
  }

  private render() {
    const s = this.state;
    const progress = missionProgress(s);
    this.root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="topbar-money">💰 ${money(s.money)}</div>
          <div class="topbar-mission">
            <div class="mission-title">${s.mission.title}${
      s.missionCleared ? "（クリア済）" : ""
    }</div>
            <div class="mission-desc">${s.mission.description}</div>
            <div class="mission-progress">PC接続：${progress.onlinePcCount} / ${
      s.mission.requiredPcCount
    }</div>
          </div>
          <button class="reset-btn" data-reset="1" title="ゲームリセット">⟲</button>
        </header>

        <div class="mode-banner">${this.modeInstruction()}</div>

        <main class="office-wrap">
          <div class="office" id="office">
            <svg class="cables-layer" viewBox="0 0 ${OFFICE_SIZE.width} ${OFFICE_SIZE.height}">
              ${this.renderCables()}
            </svg>
            ${this.renderOfficeDevices()}
          </div>
        </main>

        ${this.renderInventory()}

        <footer class="bottom-nav">
          <button class="nav-btn" data-shop="1">
            <span class="nav-icon">🛒</span><span class="nav-label">購入</span>
          </button>
          <button class="nav-btn ${s.mode === "moving" ? "nav-btn--active" : ""}" data-mode="moving">
            <span class="nav-icon">🖐</span><span class="nav-label">移動</span>
          </button>
          <button class="nav-btn ${s.mode === "connecting" ? "nav-btn--active" : ""}" data-mode="connecting">
            <span class="nav-icon">🔌</span><span class="nav-label">接続</span>
          </button>
          <button class="nav-btn" data-test="1">
            <span class="nav-icon">▶</span><span class="nav-label">テスト</span>
          </button>
        </footer>

        ${this.ui.toast ? `<div class="toast">${this.ui.toast}</div>` : ""}
        ${this.renderShop()}
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
          if (which === "test") this.ui.showTest = false;
          if (which === "clear") this.ui.showClear = false;
          this.render();
        }
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-buy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.handleBuy(btn.dataset.buy as Device["type"]);
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-unplaced-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.handleSelectUnplaced(btn.dataset.unplacedId!);
      });
    });

    this.root.querySelector('[data-claim="1"]')?.addEventListener("click", () => this.handleClaimReward());
  }
}
