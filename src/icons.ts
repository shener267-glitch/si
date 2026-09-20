import type { DeviceType } from "./types";

// V5 design-doc fix: game device icons must not be emoji (mixing icon styles as more
// device types are added gets confusing). These are small monoline SVGs sharing one
// viewBox/stroke style so any future device type can be added consistently.
const ICON_INNER: Record<DeviceType | "internet", string> = {
  desktop_pc: `<rect x="4" y="4" width="16" height="11" rx="1.5"/><line x1="9" y1="19" x2="15" y2="19"/><line x1="12" y1="15" x2="12" y2="19"/>`,
  notebook_pc: `<path d="M6 5h12v9H6z"/><path d="M3.5 16.5h17l-1.5 2.5h-14z"/>`,
  workstation: `<rect x="6.5" y="3" width="11" height="18" rx="1.5"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="10.5" x2="15" y2="10.5"/><circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none"/>`,
  server: `<rect x="4" y="4" width="16" height="4.5" rx="1"/><circle cx="7" cy="6.25" r="0.6" fill="currentColor" stroke="none"/><rect x="4" y="9.75" width="16" height="4.5" rx="1"/><circle cx="7" cy="12" r="0.6" fill="currentColor" stroke="none"/><rect x="4" y="15.5" width="16" height="4.5" rx="1"/><circle cx="7" cy="17.75" r="0.6" fill="currentColor" stroke="none"/>`,
  router: `<rect x="3.5" y="9" width="17" height="7.5" rx="2"/><path d="M9 9c0-2 1.5-3.5 3-3.5s3 1.5 3 3.5"/><line x1="7" y1="16.5" x2="7" y2="18.5"/><line x1="12" y1="16.5" x2="12" y2="18.5"/><line x1="17" y1="16.5" x2="17" y2="18.5"/>`,
  switch4: `<rect x="3.5" y="7.5" width="17" height="9" rx="2"/><line x1="6" y1="10" x2="6" y2="12"/><line x1="9.5" y1="10" x2="9.5" y2="12"/><line x1="13" y1="10" x2="13" y2="12"/><line x1="16.5" y1="10" x2="16.5" y2="12"/><circle cx="18" cy="15" r="0.6" fill="currentColor" stroke="none"/>`,
  switch8: `<rect x="3.5" y="7.5" width="17" height="9" rx="2"/><line x1="6" y1="10" x2="6" y2="12"/><line x1="9.5" y1="10" x2="9.5" y2="12"/><line x1="13" y1="10" x2="13" y2="12"/><line x1="16.5" y1="10" x2="16.5" y2="12"/><circle cx="18" cy="15" r="0.6" fill="currentColor" stroke="none"/>`,
  onu: `<rect x="5" y="7" width="14" height="10" rx="2"/><path d="M5 9L2 6"/><circle cx="15" cy="12" r="0.7" fill="currentColor" stroke="none"/>`,
  wifi: `<path d="M4 10.5a12 12 0 0 1 16 0"/><path d="M7 14a7.5 7.5 0 0 1 10 0"/><path d="M10 17.5a3 3 0 0 1 4 0"/><circle cx="12" cy="20.5" r="1" fill="currentColor" stroke="none"/>`,
  lan_jack: `<rect x="7" y="4" width="10" height="16" rx="1.5"/><rect x="10" y="9.5" width="4" height="5" rx="0.5"/>`,
  patch_panel: `<rect x="3" y="9" width="18" height="6" rx="1"/><line x1="5.5" y1="10.8" x2="5.5" y2="13.2"/><line x1="8.5" y1="10.8" x2="8.5" y2="13.2"/><line x1="11.5" y1="10.8" x2="11.5" y2="13.2"/><line x1="14.5" y1="10.8" x2="14.5" y2="13.2"/><line x1="17.5" y1="10.8" x2="17.5" y2="13.2"/>`,
  rack: `<rect x="6" y="2" width="12" height="20" rx="1"/><line x1="6" y1="6.5" x2="18" y2="6.5"/><line x1="6" y1="11" x2="18" y2="11"/><line x1="6" y1="15.5" x2="18" y2="15.5"/>`,
  internet: `<path d="M7 17a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.2 8 4.5 4.5 0 0 1 17 17H7z"/>`,
};

export function deviceIconMarkup(type: DeviceType): string {
  const inner = ICON_INNER[type];
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
