import { diagnoseDevice } from "./diagnostics";
import { resolveAllConfigs } from "./netutils";
import { connectionsOf, setPortStatus } from "./state";
import { isComputerType } from "./types";
import type { ClientConfig, Device, GameState, Ticket, TicketPriority } from "./types";

/** Picks an online PC/server not already tied to an open ticket, so tickets don't pile
 * faults onto the same device (design doc v6.1 §17-§22 - each ticket is its own,
 * independently-diagnosable problem). */
function pickTicketTarget(state: GameState): Device | null {
  const taken = new Set(
    state.tickets.filter((t) => t.status !== "解決" && t.relatedDeviceId).map((t) => t.relatedDeviceId!)
  );
  return (
    state.devices.find(
      (d) =>
        (isComputerType(d.type) || d.type === "server") &&
        d.x !== null &&
        !taken.has(d.id) &&
        diagnoseDevice(state, d.id).success
    ) ?? null
  );
}

function pushTicket(
  state: GameState,
  params: {
    employeeId: string;
    subject: string;
    description: string;
    priority: TicketPriority;
    relatedDeviceId: string | null;
    reward: number;
  }
): void {
  const id = `t${state.nextTicketSeq++}`;
  const ticket: Ticket = { id, status: "未対応", ...params };
  state.tickets.push(ticket);
}

/** Wipes DNS on a currently-working device and files a ticket about it - the device
 * stays physically/IP-wise fine, so diagnosis correctly stops at the DNS step. */
export function generateDnsFaultTicket(
  state: GameState,
  employeeId: string,
  subject: string,
  description: string,
  priority: TicketPriority
): void {
  const device = pickTicketTarget(state);
  if (!device) return;
  const resolved = resolveAllConfigs(state).get(device.id);
  const cfg = device.networkConfig as ClientConfig | undefined;
  device.networkConfig = {
    dhcpEnabled: false,
    ip: resolved?.ip ?? cfg?.ip ?? "192.168.1.50",
    subnetMask: resolved?.subnetMask ?? "255.255.255.0",
    gateway: resolved?.gateway ?? "192.168.1.1",
    dns: "",
  };
  pushTicket(state, { employeeId, subject, description, priority, relatedDeviceId: device.id, reward: 30_000 });
}

/** Disables the near-end port of a currently-working device's first link and files a
 * ticket - physically "still plugged in" from the player's point of view, but the
 * diagnosis correctly flags the port as the failure. */
export function generatePortFaultTicket(
  state: GameState,
  employeeId: string,
  subject: string,
  description: string,
  priority: TicketPriority
): void {
  const device = pickTicketTarget(state);
  if (!device) return;
  const conn = connectionsOf(state, device.id)[0];
  if (!conn) return;
  const portId = conn.fromDevice === device.id ? conn.fromPort : conn.toPort;
  setPortStatus(state, device.id, portId, "down");
  pushTicket(state, { employeeId, subject, description, priority, relatedDeviceId: device.id, reward: 30_000 });
}

export function markTicketInvestigating(state: GameState, ticketId: string): void {
  const ticket = state.tickets.find((t) => t.id === ticketId);
  if (ticket && ticket.status === "未対応") ticket.status = "調査中";
}

export function resolveTicket(state: GameState, ticketId: string): { ok: boolean; reason?: string } {
  const ticket = state.tickets.find((t) => t.id === ticketId);
  if (!ticket) return { ok: false, reason: "チケットが見つかりません。" };
  if (ticket.status === "解決") return { ok: false, reason: "すでに解決済みです。" };
  if (ticket.relatedDeviceId && !diagnoseDevice(state, ticket.relatedDeviceId).success) {
    return { ok: false, reason: "まだ対象の機器が正常に通信できていません。" };
  }
  ticket.status = "解決";
  state.money += ticket.reward;
  return { ok: true };
}

export function openTicketCount(state: GameState): number {
  return state.tickets.filter((t) => t.status !== "解決").length;
}
