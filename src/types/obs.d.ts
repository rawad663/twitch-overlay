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
    /** Only present when the source's Page permissions are "Advanced access to OBS" or higher. */
    setCurrentScene?: (name: string) => void;
  }

  interface Window {
    obsstudio?: ObsStudio;
  }
}

export {};
