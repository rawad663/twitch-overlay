/**
 * The API OBS injects into a browser source. Absent in a normal browser,
 * which is exactly how the overlay decides to run in demo mode.
 */
declare global {
  interface ObsStudio {
    pluginVersion?: string;
    onVisibilityChange?: (visible: boolean) => void;
    onActiveChange?: (active: boolean) => void;
    getCurrentScene?: (cb: (scene: unknown) => void) => void;
  }

  interface Window {
    obsstudio?: ObsStudio;
  }
}

export {};
