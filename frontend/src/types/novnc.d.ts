declare module '@novnc/novnc' {
  interface RFBOptions {
    shared?: boolean;
    credentials?: { username?: string; password?: string; target?: string };
    repeaterID?: string;
    wsProtocols?: string[];
  }

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, urlOrDataChannel: string, options?: RFBOptions);
    scaleViewport: boolean;
    resizeSession: boolean;
    viewOnly: boolean;
    focusOnClick: boolean;
    background: string;
    clipViewport: boolean;
    disconnect(): void;
    focus(): void;
    blur(): void;
    sendCtrlAltDel(): void;
    sendCredentials(credentials: { username?: string; password?: string; target?: string }): void;
    machineReboot(): void;
    machineShutdown(): void;
  }
}
