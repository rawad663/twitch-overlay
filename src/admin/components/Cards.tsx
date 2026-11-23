"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Bus } from "@/bus/bus";
import type { BusPayloads, BusType, CardImage, CardLayout, CardLibrary, CardSnapshot, CardWhen, SupportCard } from "@/bus/types";
import { useInterval } from "@/bus/useBus";
import { effectiveCredentials } from "@/bus/credentials";
import { useCredentialsSnapshot } from "@/bus/useCredentials";
import { HUD_LANES } from "@/design/stage";
import {
  CARD_LIMITS,
  CARD_SECONDS,
  LIBRARY_ART,
  blankCard,
  loadCardLibrary,
  newCardId,
  normalizeCardLibrary,
  persistCardLibrary,
  uploadIds,
  validImageSrc,
} from "@/overlay/cards/library";
import { describeWhen } from "@/overlay/cards/rotation";
import {
  blobToDataUrl,
  cardSrcs,
  dataUrlToBlob,
  deleteImage,
  getImage,
  listImageIds,
  putImage,
  shrinkImage,
  subBadges,
  useCardImageUrls,
} from "@/overlay/cards/images";
import type { SubBadge } from "@/overlay/twitch/helix";
import { SupportCardFace } from "@/overlay/components/SupportCard";
import s from "../admin.module.css";
import { Button, Field, Hint, NumberInput, Section } from "./ui";

type Send = <T extends BusType>(type: T, payload: BusPayloads[T], label: string) => void;

const LAYOUTS: Array<{ id: CardLayout; label: string }> = [
  { id: "tile", label: "Tile" },
  { id: "art", label: "Art" },
  { id: "row", label: "Row" },
];
/** Monday first — that's how the lab week reads. */
const DAYS: Array<{ d: number; label: string }> = [
  { d: 1, label: "M" },
  { d: 2, label: "T" },
  { d: 3, label: "W" },
  { d: 4, label: "T" },
  { d: 5, label: "F" },
  { d: 6, label: "S" },
  { d: 0, label: "S" },
];

type Backup = { v: 1; library: CardLibrary; uploads: Record<string, string> };

export function Cards({
  card,
  bus,
  send,
  disabled,
}: {
  card: CardSnapshot | undefined;
  bus: Bus | null;
  send: Send;
  disabled: boolean;
}) {
  const [lib, setLib] = useState<CardLibrary>(loadCardLibrary);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SupportCard | null>(null);
  const [rev, setRev] = useState(0);
  const [hint, setHint] = useState("");
  const [backup, setBackup] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  useInterval(() => setClock(Date.now()), card?.until ? 1000 : null);

  const auth = effectiveCredentials(useCredentialsSnapshot(), { token: "", clientId: "" });
  const [badges, setBadges] = useState<SubBadge[]>([]);
  useEffect(() => {
    let live = true;
    void subBadges(auth).then((b) => live && setBadges(b));
    return () => {
      live = false;
    };
  }, [auth.token, auth.clientId]); // eslint-disable-line react-hooks/exhaustive-deps -- auth is read by value

  const [uploads, setUploads] = useState<string[]>([]);
  useEffect(() => {
    void listImageIds().then(setUploads);
  }, [rev]);

  const srcs = useMemo(() => {
    const all = new Set(cardSrcs(draft ? [...lib.cards, draft] : lib.cards));
    for (const a of LIBRARY_ART) all.add(`lib:${a.name}`);
    for (const id of uploads) all.add(`up:${id}`);
    return [...all].sort();
  }, [lib.cards, draft, uploads]);
  const urls = useCardImageUrls(srcs, auth, rev);

  const push = useCallback(
    (next: CardLibrary, label?: string) => {
      const clean = normalizeCardLibrary(next);
      setLib(clean);
      persistCardLibrary(clean);
      bus?.send("cards", { library: clean });
      if (label) setHint(label);
    },
    [bus],
  );

  /* The dock and the sources share storage, but a source that loaded before
     the dock's last save needs telling once. */
  useEffect(() => {
    if (bus) bus.send("cards", { library: loadCardLibrary() });
  }, [bus]);

  /** Drop uploads no saved card points at. Run after saves, never mid-edit. */
  const sweep = useCallback(async (keep: CardLibrary) => {
    const used = uploadIds(keep);
    for (const id of await listImageIds()) if (!used.has(id)) await deleteImage(id);
    setRev((n) => n + 1);
  }, []);

  const patchLib = (p: Partial<CardLibrary>) => push({ ...lib, ...p });
  const patchCard = (id: string, p: Partial<SupportCard>) =>
    push({ ...lib, cards: lib.cards.map((c) => (c.id === id ? { ...c, ...p } : c)) });

  const move = (id: string, by: number) => {
    const i = lib.cards.findIndex((c) => c.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= lib.cards.length) return;
    const cards = [...lib.cards];
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
    push({ ...lib, cards });
  };

  const remove = (id: string) => {
    const next = { ...lib, cards: lib.cards.filter((c) => c.id !== id) };
    push(next, "Card removed.");
    if (editId === id) {
      setEditId(null);
      setDraft(null);
    }
    void sweep(next);
  };

  const edit = (c: SupportCard | null) => {
    setEditId(c?.id ?? null);
    setDraft(c ? structuredClone(c) : null);
    setHint("");
  };

  const add = () => {
    if (lib.cards.length >= CARD_LIMITS.cards) {
      setHint(`${CARD_LIMITS.cards} cards is the limit.`);
      return;
    }
    const c = blankCard();
    push({ ...lib, cards: [...lib.cards, { ...c, enabled: false }] });
    edit({ ...c, enabled: false });
  };

  const save = () => {
    if (!draft) return;
    const next = { ...lib, cards: lib.cards.map((c) => (c.id === draft.id ? draft : c)) };
    push(next, "Card saved.");
    void sweep(next);
  };

  /* ── backup: the only copy of an upload is in this OBS profile ── */
  const makeBackup = async () => {
    const out: Backup = { v: 1, library: lib, uploads: {} };
    for (const id of uploadIds(lib)) {
      const blob = await getImage(id);
      if (blob) out.uploads[id] = await blobToDataUrl(blob);
    }
    const text = JSON.stringify(out);
    setBackup(text);
    try {
      await navigator.clipboard.writeText(text);
      setHint("Backup copied. Paste it somewhere safe, like a note.");
    } catch {
      setHint("Couldn't reach the clipboard. Select the text below and copy it.");
    }
  };

  const restore = async (text: string) => {
    try {
      const parsed = JSON.parse(text) as Partial<Backup>;
      const library = normalizeCardLibrary(parsed.library);
      let n = 0;
      for (const [id, url] of Object.entries(parsed.uploads ?? {})) {
        if (!/^[a-z0-9]{6,32}$/.test(id)) continue;
        const blob = await dataUrlToBlob(String(url));
        if (blob && (await putImage(id, blob))) n++;
      }
      push(library, `Restored ${library.cards.length} cards and ${n} uploads.`);
      setBackup(null);
      edit(null);
      setRev((r) => r + 1);
    } catch {
      setHint("That isn't a card backup.");
    }
  };

  const onAir = card ? lib.cards.find((c) => c.id === card.id) : undefined;
  const left = card?.until ? Math.max(0, Math.round((card.until - clock) / 1000)) : 0;

  return (
    <Section title="Support cards" disabled={disabled}>
      <div className={s.row2}>
        <Button variant={lib.on ? "ghost" : "warn"} onClick={() => patchLib({ on: !lib.on })}>
          {lib.on ? "Cards on" : "Cards off"}
        </Button>
        <Button variant="ghost" onClick={() => patchLib({ paused: !lib.paused })} disabled={!lib.on}>
          {lib.paused ? "Resume" : "Pause"}
        </Button>
        <Button variant="ghost" onClick={() => send("card.next", {}, "Next card")} disabled={!lib.on}>
          Next ›
        </Button>
      </div>

      <div className={s.cardAir} role="status">
        <i className={`${s.dot} ${!lib.on || !onAir ? s.dotOff : card?.hidden ? s.dotWarn : ""}`} />
        <span className={s.cardAirText}>
          {!lib.on
            ? "Cards are off."
            : onAir
              ? <>On air: <b>{onAir.title || onAir.kicker || "card"}</b></>
              : card === null
                ? "No card can show tonight."
                : "Waiting for the HUD…"}
        </span>
        {lib.on && onAir && (
          <span className={s.cardAirMeta}>
            {card?.hidden ? "hidden by alert" : lib.paused ? "paused" : `next in ${left}s`}
          </span>
        )}
      </div>

      <div className={s.row2}>
        <Field id="cardSeconds" label="Seconds each">
          <NumberInput
            id="cardSeconds"
            value={lib.seconds}
            min={CARD_SECONDS.min}
            max={CARD_SECONDS.max}
            onChange={(n) => Number.isFinite(n) && n >= CARD_SECONDS.min && patchLib({ seconds: n })}
          />
        </Field>
        <Field id="cardX" label="Left (x)">
          <NumberInput id="cardX" value={lib.x} min={0} onChange={(x) => Number.isFinite(x) && patchLib({ x })} />
        </Field>
        <Field id="cardY" label="Top (y)">
          <NumberInput id="cardY" value={lib.y} min={0} onChange={(y) => Number.isFinite(y) && patchLib({ y })} />
        </Field>
      </div>
      <div style={{ marginTop: 6 }}>
        <Hint>
          The card is 320×176 on the 1920×1080 stage.{" "}
          {(lib.x !== HUD_LANES.support[0] || lib.y !== HUD_LANES.support[1]) && (
            <button
              type="button"
              className={s.linkBtn}
              onClick={() => patchLib({ x: HUD_LANES.support[0], y: HUD_LANES.support[1] })}
            >
              Reset spot
            </button>
          )}
        </Hint>
      </div>

      <div className={s.cardList}>
        {lib.cards.map((c, i) => {
          const thumb = c.images[0] ? urls[c.images[0].src] : undefined;
          return (
            <div
              key={c.id}
              className={`${s.cardRow} ${editId === c.id ? s.cardRowSel : ""} ${c.enabled ? "" : s.cardRowOff}`}
            >
              <div className={s.cardOrder}>
                <button type="button" onClick={() => move(c.id, -1)} disabled={i === 0} aria-label="Move up">▲</button>
                <button type="button" onClick={() => move(c.id, 1)} disabled={i === lib.cards.length - 1} aria-label="Move down">▼</button>
              </div>
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={s.cardThumb} src={thumb} alt="" />
              ) : (
                <i className={`${s.cardThumb} ${s.cardThumbOrb}`} />
              )}
              <button type="button" className={s.cardInfo} onClick={() => edit(editId === c.id ? null : c)}>
                <span className={s.cardName}>{c.title || c.kicker || "Untitled card"}</span>
                <span className={s.chips}>
                  {card?.id === c.id && lib.on && <span className={`${s.chip} ${s.chipLive}`}>Live</span>}
                  <span className={s.chip}>{c.layout}</span>
                  {describeWhen(c).map((w) => (
                    <span key={w} className={s.chip}>{w}</span>
                  ))}
                </span>
              </button>
              <div className={s.cardTools}>
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={(e) => patchCard(c.id, { enabled: e.target.checked })}
                  aria-label={`${c.title || "Card"} in rotation`}
                />
                <Button variant="ghost" onClick={() => send("card.show", { id: c.id }, "Show card")} disabled={!lib.on}>
                  Show
                </Button>
              </div>
            </div>
          );
        })}
        <Button variant="ghost" size="block" onClick={add}>
          + New card
        </Button>
      </div>

      {hint && <div style={{ marginTop: 8 }}><Hint>{hint}</Hint></div>}

      {draft && (
        <CardEditor
          key={draft.id}
          draft={draft}
          setDraft={setDraft}
          urls={urls}
          badges={badges}
          uploads={uploads}
          onUploaded={() => setRev((n) => n + 1)}
          onSave={save}
          onCancel={() => edit(null)}
          onRemove={() => remove(draft.id)}
          dirty={JSON.stringify(draft) !== JSON.stringify(lib.cards.find((c) => c.id === draft.id))}
        />
      )}

      <div className={s.row2} style={{ marginTop: 12 }}>
        <Button variant="ghost" onClick={() => void makeBackup()}>Copy backup</Button>
        <Button variant="ghost" onClick={() => setBackup(backup === null ? "" : null)}>
          {backup === null ? "Restore…" : "Close"}
        </Button>
      </div>
      {backup !== null && (
        <BackupBox text={backup} onRestore={(t) => void restore(t)} />
      )}
      <div style={{ marginTop: 6 }}>
        <Hint>Uploads live in this OBS profile only. Clearing OBS&apos;s browser cache deletes them, so keep a backup.</Hint>
      </div>
    </Section>
  );
}

function BackupBox({ text, onRestore }: { text: string; onRestore: (t: string) => void }) {
  const [value, setValue] = useState(text);
  return (
    <div style={{ marginTop: 8 }}>
      <textarea
        className={s.input}
        rows={3}
        value={value}
        placeholder="Paste a card backup here"
        aria-label="Card backup"
        onFocus={(e) => e.target.select()}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button style={{ marginTop: 6 }} onClick={() => onRestore(value)} disabled={!value.trim() || value === text}>
        Restore this backup
      </Button>
    </div>
  );
}

function Counter({ value, max }: { value: string; max: number }) {
  return <span className={s.counter}>{value.length}/{max}</span>;
}

function CardEditor({
  draft,
  setDraft,
  urls,
  badges,
  uploads,
  onUploaded,
  onSave,
  onCancel,
  onRemove,
  dirty,
}: {
  draft: SupportCard;
  setDraft: (c: SupportCard) => void;
  urls: Record<string, string>;
  badges: SubBadge[];
  uploads: string[];
  onUploaded: () => void;
  onSave: () => void;
  onCancel: () => void;
  onRemove: () => void;
  dirty: boolean;
}) {
  const [slot, setSlot] = useState(0);
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");
  const [confirmRm, setConfirmRm] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const set = (p: Partial<SupportCard>) => setDraft({ ...draft, ...p });
  const setWhen = (p: Partial<CardWhen>) => set({ when: { ...draft.when, ...p } });
  const slots = draft.layout === "row" ? CARD_LIMITS.images : 1;
  const at = Math.min(slot, slots - 1);

  const setImage = (i: number, p: Partial<CardImage>) => {
    const images = [...draft.images];
    while (images.length <= i) images.push({ src: "", label: "" });
    images[i] = { ...images[i]!, ...p };
    set({ images: images.filter((im) => im.src) });
  };
  const pick = (src: string) => {
    setImage(at, { src });
    setErr("");
    if (draft.layout === "row" && at < slots - 1) setSlot(at + 1);
  };
  const clearSlot = (i: number) => set({ images: draft.images.filter((_, k) => k !== i) });

  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) {
      setErr("That file isn't an image.");
      return;
    }
    try {
      const blob = await shrinkImage(f);
      const id = newCardId() + newCardId();
      if (!(await putImage(id, blob))) {
        setErr("This OBS profile won't store images (IndexedDB is blocked).");
        return;
      }
      onUploaded();
      pick(`up:${id}`);
    } catch {
      setErr("Couldn't read that image.");
    }
  };

  const addLink = () => {
    const src = validImageSrc(link.trim());
    if (!src.startsWith("https://")) {
      setErr("Paste an https:// image link.");
      return;
    }
    pick(src);
    setLink("");
  };

  const choices: Array<{ src: string; title: string }> = [
    ...LIBRARY_ART.map((a) => ({ src: `lib:${a.name}`, title: a.label })),
    ...badges.map((b) => ({ src: `twitch:sub:${b.version}`, title: b.title || `Sub badge ${b.version}` })),
    ...uploads.map((id) => ({ src: `up:${id}`, title: "Your upload" })),
  ];

  return (
    <div className={s.cardEditor}>
      <div className={s.label}>Preview</div>
      <div className={s.cardPreview}>
        <div className={s.cardPreviewIn}>
          <SupportCardFace card={draft} urls={urls} seconds={0} />
        </div>
      </div>

      <div className={s.label}>Layout</div>
      <div className={s.seg}>
        {LAYOUTS.map((l) => (
          <button
            type="button"
            key={l.id}
            className={draft.layout === l.id ? s.segOn : ""}
            onClick={() => set({ layout: l.id, images: l.id === "row" ? draft.images : draft.images.slice(0, 1) })}
          >
            {l.label}
          </button>
        ))}
      </div>
      <Hint>
        {draft.layout === "art"
          ? "Art: a picture fills the right side and fades into the purple. For scenes and screenshots."
          : draft.layout === "tile"
            ? "Tile: one framed square on the left. For a single thing: a reward, an emote, a logo."
            : "Row: up to three pictures with labels. For badge tiers or emotes."}
      </Hint>

      <label className={s.label} htmlFor="cardKicker">
        Kicker <Counter value={draft.kicker} max={CARD_LIMITS.kicker} />
      </label>
      <input id="cardKicker" className={s.input} maxLength={CARD_LIMITS.kicker} value={draft.kicker} onChange={(e) => set({ kicker: e.target.value })} placeholder="Free with Prime" />

      {draft.layout !== "row" && (
        <>
          <label className={s.label} htmlFor="cardTitle">
            Title <Counter value={draft.title} max={CARD_LIMITS.title} />
          </label>
          <input id="cardTitle" className={s.input} maxLength={CARD_LIMITS.title} value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Got Prime? Your free sub works here" />
        </>
      )}

      <label className={s.label} htmlFor="cardBody">
        Body <Counter value={draft.body} max={CARD_LIMITS.body} />
      </label>
      <input id="cardBody" className={s.input} maxLength={CARD_LIMITS.body} value={draft.body} onChange={(e) => set({ body: e.target.value })} placeholder="Wrap a word in **stars** to make it bold" />

      {draft.layout !== "row" && (
        <>
          <label className={s.label} htmlFor="cardUrl">
            Link line (optional) <Counter value={draft.url} max={CARD_LIMITS.url} />
          </label>
          <input id="cardUrl" className={s.input} maxLength={CARD_LIMITS.url} value={draft.url} onChange={(e) => set({ url: e.target.value })} placeholder="pathofexile.com/twitchdrops" />
        </>
      )}

      <div className={s.label}>{draft.layout === "row" ? "Pictures" : "Picture"}</div>
      <div className={s.slots}>
        {Array.from({ length: slots }, (_, i) => {
          const im = draft.images[i];
          const url = im ? urls[im.src] : undefined;
          return (
            <div key={i} className={`${s.slot} ${i === at ? s.slotOn : ""}`}>
              <button type="button" className={s.slotPic} onClick={() => setSlot(i)} aria-label={`Picture ${i + 1}`}>
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" />
                ) : (
                  <span>{im ? "?" : "+"}</span>
                )}
              </button>
              {draft.layout === "row" && (
                <input
                  className={s.input}
                  maxLength={CARD_LIMITS.label}
                  value={im?.label ?? ""}
                  placeholder="Label"
                  aria-label={`Label ${i + 1}`}
                  onChange={(e) => setImage(i, { label: e.target.value })}
                  disabled={!im}
                />
              )}
              {im && (
                <button type="button" className={s.linkBtn} onClick={() => clearSlot(i)}>
                  remove
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className={s.lib}>
        {choices.map((c) => (
          <button
            type="button"
            key={c.src}
            title={c.title}
            className={draft.images[at]?.src === c.src ? s.libOn : ""}
            onClick={() => pick(c.src)}
          >
            {urls[c.src] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[c.src]} alt={c.title} />
            ) : (
              <i className={s.cardThumbOrb} />
            )}
          </button>
        ))}
        <button type="button" className={s.libAdd} onClick={() => file.current?.click()} title="Upload an image">
          +
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className={s.row2} style={{ marginTop: 6 }}>
        <input
          className={s.input}
          style={{ flex: 1, minWidth: 0 }}
          value={link}
          placeholder="…or paste an https:// image link"
          aria-label="Image link"
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addLink()}
        />
        <Button variant="ghost" onClick={addLink} disabled={!link.trim()}>Use</Button>
      </div>
      {!badges.length && <Hint>Your sub badges appear here once the dock has a Twitch connection.</Hint>}
      {err && <Hint>{err}</Hint>}

      {draft.layout === "art" && draft.images[0] && (
        <>
          <label className={s.label} htmlFor="cardFocus">Picture focus (top ↔ bottom)</label>
          <input id="cardFocus" type="range" className={s.range} style={{ width: "100%" }} min={0} max={100} value={draft.focus} onChange={(e) => set({ focus: Number(e.target.value) })} />
        </>
      )}

      <label className={s.label} htmlFor="cardLabs">Show on</label>
      <select id="cardLabs" className={s.input} value={draft.when.labs} onChange={(e) => setWhen({ labs: e.target.value as CardWhen["labs"] })}>
        <option value="">Every stream</option>
        <option value="any">Lab nights</option>
        <option value="play">Play labs</option>
        <option value="dev">Dev labs</option>
      </select>
      <div className={s.label}>Days (none picked = every day)</div>
      <div className={s.days}>
        {DAYS.map(({ d, label }) => {
          const on = draft.when.days.includes(d);
          return (
            <button
              type="button"
              key={d}
              className={on ? s.segOn : ""}
              aria-pressed={on}
              onClick={() => setWhen({ days: on ? draft.when.days.filter((x) => x !== d) : [...draft.when.days, d] })}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className={s.row2}>
        <Field id="cardFrom" label="From">
          <input id="cardFrom" type="date" className={s.input} value={draft.when.from} onChange={(e) => setWhen({ from: e.target.value })} />
        </Field>
        <Field id="cardUntil" label="Until">
          <input id="cardUntil" type="date" className={s.input} value={draft.when.until} onChange={(e) => setWhen({ until: e.target.value })} />
        </Field>
      </div>
      <Hint>Lab nights follow the dock&apos;s lab for today, or the usual schedule (play Mon and Thu, dev Wed) when none is set.</Hint>

      <div className={s.row2} style={{ marginTop: 12 }}>
        <Button onClick={onSave} disabled={!dirty}>Save card</Button>
        <Button variant="ghost" onClick={onCancel}>{dirty ? "Discard" : "Close"}</Button>
        <span style={{ flex: 1 }} />
        {confirmRm ? (
          <Button variant="remove" onClick={onRemove}>Delete card</Button>
        ) : (
          <Button variant="remove" onClick={() => setConfirmRm(true)} aria-label="Delete card">✕</Button>
        )}
      </div>
    </div>
  );
}

