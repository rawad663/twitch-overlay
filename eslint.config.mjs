import next from "eslint-config-next";

const config = [
  {
    ignores: ["out/**", ".next/**", ".verify/**"],
  },
  ...next,
  {
    rules: {
      // An empty catch is the idiom here: every localStorage touch has to
      // survive OBS blocking storage, and there is nothing useful to log.
      "no-empty": ["error", { allowEmptyCatch: true }],

      /* ── React Compiler advisories ──
         The compiler is not enabled in this project; these rules ship as
         errors to prepare for it. Two of them fight this app's shape rather
         than finding bugs in it, so they are warnings we read rather than
         gates we trip over:

         - set-state-in-effect: the overlay's initial state genuinely lives in
           browser-only sources (localStorage settings, saved tallies, a token
           in the URL). Reading them during render would break the static
           export's hydration, so an on-mount sync is the correct shape.

         - refs/memoization: the canvas engine, the IRC socket and the audio
           context are imperative objects held in refs on purpose. The reads
           the rule flags are inside useCallback bodies that run from event
           handlers, never during render — a distinction the rule cannot make.

         Everything else, including rules-of-hooks and exhaustive-deps, stays
         an error. */
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
];

export default config;
