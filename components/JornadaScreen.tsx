"use client";

import { useState } from "react";
import type { Player, RealResults, Match } from "@/lib/scoring";
import { scoreMatch, GRUPO_PTS, multiplicadorPartido } from "@/lib/scoring";
import type { YoutubeUrls } from "@/lib/supabase";
import horariosData from "@/data/horarios_grupos.json";
import crusesData from "@/data/cruces_eliminatoria.json";
import { C } from "@/lib/theme";

// ---- tipos grupos ----

interface Fixture {
  partido: string;
  local: string;
  visitante: string;
  kickoff: string;
}
const horarios = horariosData as Record<string, Fixture[]>;
const DAYS = Object.keys(horarios).sort();

// ---- tipos eliminatorias ----

type CruceReal = {
  partido: string; local: string; visitante: string;
  kickoff?: string; jugadores: string[]
};
const CRUCES = crusesData as Record<string, CruceReal[]>;

const KO_PTS: Record<string, [number, number, number]> = {
  dieciseisavos: [3, 2, 5], octavos: [3, 2, 5], cuartos: [4, 2, 6],
  semis: [6, 4, 10], "3y4": [10, 5, 15], final: [12, 6, 18],
};

const KO_RONDAS = [
  { key: "dieciseisavos", label: "1/16" },
  { key: "octavos",       label: "Octavos" },
  { key: "cuartos",       label: "Cuartos" },
  { key: "semis",         label: "Semis" },
  { key: "3y4",           label: "3º/4º" },
  { key: "final",         label: "Final" },
] as const;

type KoRondaKey = typeof KO_RONDAS[number]["key"];
type Phase = "grupos" | "eliminatorias";

const TODAY_ISO = new Date().toISOString().slice(0, 10);
const DEFAULT_PHASE: Phase = TODAY_ISO >= "2026-06-28" ? "eliminatorias" : "grupos";

function getDefaultKoRonda(): KoRondaKey {
  for (let i = KO_RONDAS.length - 1; i >= 0; i--) {
    if ((CRUCES["enfr_" + KO_RONDAS[i].key] ?? []).some((c) => c.kickoff)) {
      return KO_RONDAS[i].key;
    }
  }
  return "dieciseisavos";
}

function formatKoHora(kickoff: string): string {
  return new Date(kickoff).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit",
  });
}
function formatKoDia(kickoff: string): string {
  return new Date(kickoff).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid", day: "numeric", month: "short",
  });
}

// ---- helpers de fecha/hora (grupos) ----

function todayString(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function getDefaultDay(): string {
  const today = todayString();
  if (DAYS.includes(today)) return today;
  const upcoming = DAYS.filter((d) => d > today);
  return upcoming.length ? upcoming[0] : DAYS[DAYS.length - 1];
}

function formatDia(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString("es-ES", { weekday: "long" });
  const month = date.toLocaleDateString("es-ES", { month: "long" });
  return `${weekday} ${d} de ${month}`;
}

function formatHora(kickoff: string): string {
  return kickoff.slice(11, 16);
}

function nowMadrid(): string {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "Europe/Madrid" })
    .replace(" ", "T")
    .slice(0, 16);
}

type MatchStatus = "proximo" | "pendiente" | "finalizado";

function getMatchStatus(kickoff: string, hasResult: boolean): MatchStatus {
  if (hasResult) return "finalizado";
  return nowMadrid() < kickoff.slice(0, 16) ? "proximo" : "pendiente";
}

// ---- estilos de hit ----

const HIT_COLOR: Record<"exacto" | "signo" | "fallo", string> = {
  exacto: "#2E8B57",
  signo:  "#B87333",
  fallo:  C.rojo,
};

// ---- subcomponentes ----

const STATUS_CFG: Record<"proximo" | "pendiente", { label: string; color: string; border: string }> = {
  proximo:   { label: "Próx.",  color: C.muted,   border: C.line },
  pendiente: { label: "Pend.",  color: "#B87333",  border: "#D4A06A" },
};

function StatusBadge({ status }: { status: "proximo" | "pendiente" }) {
  const cfg = STATUS_CFG[status];
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: ".06em",
      textTransform: "uppercase", color: cfg.color,
      border: `1px solid ${cfg.border}`, borderRadius: 2,
      padding: "2px 5px", flexShrink: 0,
    }}>
      {cfg.label}
    </span>
  );
}

function Score({ a, b }: { a: number; b: number }) {
  return (
    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 500 }}>
      {a}<span style={{ color: C.muted, margin: "0 3px" }}>–</span>{b}
    </span>
  );
}

const hStyle: React.CSSProperties = {
  fontFamily: "'Anton', sans-serif", fontWeight: 400, fontSize: 22,
  color: C.ink, margin: 0, letterSpacing: ".01em", textTransform: "uppercase",
};

const btnBase: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 3, flexShrink: 0,
  background: "none", display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 18, fontWeight: 700,
};

// ---- componente principal ----

interface Props {
  players: Player[];
  real: RealResults;
  youtube: YoutubeUrls;
}

export default function JornadaScreen({ players, real, youtube }: Props) {
  const [day, setDay] = useState<string>(getDefaultDay);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [phase, setPhase] = useState<Phase>(DEFAULT_PHASE);
  const [koRonda, setKoRonda] = useState<KoRondaKey>(getDefaultKoRonda);

  const idx = DAYS.indexOf(day);
  const fixtures = (horarios[day] ?? [])
    .slice()
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  function toggleFixture(partido: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(partido) ? next.delete(partido) : next.add(partido);
      return next;
    });
  }

  function switchPhase(newPhase: Phase) {
    setPhase(newPhase);
    setOpen(new Set());
  }

  function switchKoRonda(ronda: KoRondaKey) {
    setKoRonda(ronda);
    setOpen(new Set());
  }

  return (
    <div>
      <h2 style={hStyle}>Por día</h2>

      {/* Toggle Grupos / Eliminatorias */}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {(["grupos", "eliminatorias"] as Phase[]).map((ph) => (
          <button
            key={ph}
            onClick={() => switchPhase(ph)}
            style={{
              flex: 1, height: 34, borderRadius: 20,
              fontWeight: 700, fontSize: 13, cursor: "pointer",
              background: phase === ph ? C.ink : "transparent",
              color: phase === ph ? C.chalk : C.muted,
              border: `1px solid ${phase === ph ? C.ink : C.line}`,
            }}
          >
            {ph === "grupos" ? "Fase de grupos" : "Eliminatorias"}
          </button>
        ))}
      </div>

      {/* ---- Vista fase de grupos ---- */}
      {phase === "grupos" && (
        <div>
          {/* Selector de día */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
            <button
              onClick={() => setDay(DAYS[idx - 1])}
              disabled={idx === 0}
              style={{
                ...btnBase,
                border: `1px solid ${idx === 0 ? C.line : C.ink}`,
                cursor: idx === 0 ? "default" : "pointer",
                color: idx === 0 ? C.line : C.ink,
              }}
              aria-label="Día anterior"
            >
              ‹
            </button>

            <select
              value={day}
              onChange={(e) => setDay(e.target.value)}
              style={{
                flex: 1, height: 36, border: `1px solid ${C.ink}`,
                borderRadius: 3, background: C.paper, color: C.ink,
                fontWeight: 700, fontSize: 13, letterSpacing: ".01em",
                padding: "0 8px", cursor: "pointer", appearance: "none",
                textAlign: "center",
              }}
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>{formatDia(d)}</option>
              ))}
            </select>

            <button
              onClick={() => setDay(DAYS[idx + 1])}
              disabled={idx === DAYS.length - 1}
              style={{
                ...btnBase,
                border: `1px solid ${idx === DAYS.length - 1 ? C.line : C.ink}`,
                cursor: idx === DAYS.length - 1 ? "default" : "pointer",
                color: idx === DAYS.length - 1 ? C.line : C.ink,
              }}
              aria-label="Día siguiente"
            >
              ›
            </button>
          </div>

          {/* Lista de partidos */}
          <div style={{ marginTop: 16 }}>
            {fixtures.length === 0 && (
              <p style={{ color: C.muted, textAlign: "center", paddingTop: 24 }}>
                Sin partidos este día
              </p>
            )}
            {fixtures.map((fixture) => {
              const r = real[fixture.partido];
              const isOpen = open.has(fixture.partido);
              const yt = youtube[fixture.partido];
              const mult = multiplicadorPartido(fixture.partido, fixture.local, fixture.visitante);

              return (
                <div key={fixture.partido} style={{ borderBottom: `1px solid ${C.line}` }}>

                  {/* Cabecera colapsable */}
                  <button
                    onClick={() => toggleFixture(fixture.partido)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center",
                      gap: 8, padding: "11px 2px",
                      border: "none", background: "none", cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {/* Hora */}
                    <span style={{
                      fontFamily: "'DM Mono', monospace", fontSize: 12,
                      color: C.muted, flexShrink: 0, width: 36,
                    }}>
                      {formatHora(fixture.kickoff)}
                    </span>

                    {/* Equipos */}
                    <span style={{
                      flex: 1, fontWeight: 700, fontSize: 14, color: C.ink,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      textAlign: "left",
                    }}>
                      {fixture.local} – {fixture.visitante}
                    </span>

                    {mult > 1 && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: C.chalk, background: C.rojo,
                        borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                      }}>
                        x{mult}
                      </span>
                    )}

                    {/* Resultado o estado */}
                    <span style={{ fontSize: 13, flexShrink: 0 }}>
                      {(() => {
                        const status = getMatchStatus(fixture.kickoff, !!r);
                        if (status === "finalizado") return <Score a={r!.local} b={r!.visitante} />;
                        return <StatusBadge status={status} />;
                      })()}
                    </span>

                    {/* YouTube */}
                    {yt && (
                      <a
                        href={yt}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Ver resumen"
                        style={{
                          flexShrink: 0, fontSize: 15, color: C.rojo,
                          textDecoration: "none", lineHeight: 1,
                          padding: "2px 4px",
                        }}
                      >
                        ▶
                      </a>
                    )}

                    {/* Chevron */}
                    <span style={{
                      flexShrink: 0, fontSize: 12, color: C.muted,
                      transform: isOpen ? "rotate(90deg)" : "none",
                      transition: "transform .15s ease",
                      display: "inline-block", width: 14, textAlign: "center",
                    }}>
                      ›
                    </span>
                  </button>

                  {/* Predicciones expandidas */}
                  {isOpen && (
                    <div style={{ paddingBottom: 8, paddingLeft: 44 }}>
                      {players.map((p) => {
                        const pm = p.fase_grupos.find((m) => m.partido === fixture.partido);
                        if (!pm) return null;
                        const s = r ? scoreMatch(pm.pred, r, [GRUPO_PTS[0] * mult, GRUPO_PTS[1] * mult, GRUPO_PTS[2] * mult]) : null;
                        const hit = (s?.hit ?? null) as "exacto" | "signo" | "fallo" | null;

                        return (
                          <div
                            key={p.id}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "3px 2px",
                              borderBottom: `1px solid ${C.chalk}`,
                            }}
                          >
                            <span style={{
                              fontSize: 12, color: C.muted, fontWeight: 400,
                              width: 72, flexShrink: 0,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {p.nombre.split(" ")[0]}
                            </span>

                            <span style={{
                              fontFamily: "'DM Mono', monospace", fontSize: 13,
                              color: hit ? HIT_COLOR[hit] : C.muted,
                              fontWeight: hit ? 600 : 400,
                              flexShrink: 0,
                            }}>
                              {pm.pred.local}–{pm.pred.visitante}
                            </span>

                            <span style={{
                              fontFamily: "'DM Mono', monospace", fontSize: 11,
                              color: s && s.pts > 0 ? C.pitch : C.line,
                              fontWeight: s && s.pts > 0 ? 700 : 400,
                              flexShrink: 0, whiteSpace: "nowrap",
                            }}>
                              {s ? `+${s.pts} pts` : "–"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Vista eliminatorias ---- */}
      {phase === "eliminatorias" && (
        <div>
          {/* Selector de ronda */}
          <div style={{ display: "flex", gap: 6, marginTop: 14, marginBottom: 14, flexWrap: "wrap" }}>
            {KO_RONDAS.map((r) => (
              <button
                key={r.key}
                onClick={() => switchKoRonda(r.key)}
                style={{
                  padding: "4px 12px", borderRadius: 20,
                  fontWeight: 700, fontSize: 12, cursor: "pointer",
                  background: koRonda === r.key ? C.ink : "transparent",
                  color: koRonda === r.key ? C.chalk : C.muted,
                  border: `1px solid ${koRonda === r.key ? C.ink : C.line}`,
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Lista de cruces */}
          {(() => {
            const cruces = CRUCES["enfr_" + koRonda] ?? [];
            const hasResults = cruces.some((c) => !!c.kickoff || !!real[c.partido]);

            if (!hasResults) {
              return (
                <p style={{ textAlign: "center", color: C.muted, paddingTop: 32, fontSize: 14 }}>
                  ⏳ PRÓXIMAMENTE — Los partidos de esta ronda aún no han comenzado
                </p>
              );
            }

            return (
              <div>
                {cruces.map((cruce) => {
                  const r = real[cruce.partido];
                  const isOpen = open.has(cruce.partido);
                  const yt = youtube[cruce.partido];
                  const aciertos = cruce.jugadores.length;
                  const mult = multiplicadorPartido(cruce.partido, cruce.local, cruce.visitante);
                  const baremo: [number, number, number] = [
                    KO_PTS[koRonda][0] * mult,
                    KO_PTS[koRonda][1] * mult,
                    KO_PTS[koRonda][2] * mult,
                  ];

                  return (
                    <div key={cruce.partido} style={{ borderBottom: `1px solid ${C.line}` }}>

                      {/* Cabecera colapsable */}
                      <button
                        onClick={() => toggleFixture(cruce.partido)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center",
                          gap: 8, padding: "11px 2px",
                          border: "none", background: "none", cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        {/* Hora / Día */}
                        <div style={{ width: 40, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                          {cruce.kickoff && (
                            <>
                              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: C.muted, lineHeight: 1.3 }}>
                                {formatKoHora(cruce.kickoff)}
                              </span>
                              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: C.muted, lineHeight: 1.3 }}>
                                {formatKoDia(cruce.kickoff)}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Nombre partido + aciertos */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontWeight: 700, fontSize: 14, color: C.ink,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {cruce.local} – {cruce.visitante}
                          </div>
                          <div style={{ fontSize: 10, color: C.muted }}>
                            {aciertos === 0
                              ? "Nadie acertó este cruce"
                              : `${aciertos}/8 acertaron este cruce`}
                          </div>
                        </div>

                        {/* Resultado o estado */}
                        <span style={{ fontSize: 13, flexShrink: 0 }}>
                          {r ? (
                            <Score a={r.local} b={r.visitante} />
                          ) : cruce.kickoff ? (
                            <StatusBadge status={getMatchStatus(cruce.kickoff, false) as "proximo" | "pendiente"} />
                          ) : null}
                        </span>

                        {/* YouTube */}
                        {yt && (
                          <a
                            href={yt}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Ver resumen"
                            style={{
                              flexShrink: 0, fontSize: 15, color: C.rojo,
                              textDecoration: "none", lineHeight: 1,
                              padding: "2px 4px",
                            }}
                          >
                            ▶
                          </a>
                        )}

                        {/* Chevron */}
                        <span style={{
                          flexShrink: 0, fontSize: 12, color: C.muted,
                          transform: isOpen ? "rotate(90deg)" : "none",
                          transition: "transform .15s ease",
                          display: "inline-block", width: 14, textAlign: "center",
                        }}>
                          ›
                        </span>
                      </button>

                      {/* Predicciones expandidas */}
                      {isOpen && (
                        <div style={{ paddingBottom: 8, paddingLeft: 50 }}>
                          {players.map((p) => {
                            const preds = (p as unknown as Record<string, Match[]>)["enfr_" + koRonda] ?? [];
                            const pm = preds.find((m) => m.partido === cruce.partido);

                            if (!pm) {
                              return (
                                <div
                                  key={p.id}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 10,
                                    padding: "3px 2px",
                                    borderBottom: `1px solid ${C.chalk}`,
                                  }}
                                >
                                  <span style={{
                                    fontSize: 12, color: C.muted,
                                    width: 72, flexShrink: 0,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                  }}>
                                    {p.nombre.split(" ")[0]}
                                  </span>
                                  <span style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>
                                    No acertó
                                  </span>
                                </div>
                              );
                            }

                            const s = r ? scoreMatch(pm.pred, r, baremo) : null;
                            const hit = (s?.hit ?? null) as "exacto" | "signo" | "fallo" | null;

                            return (
                              <div
                                key={p.id}
                                style={{
                                  display: "flex", alignItems: "center", gap: 10,
                                  padding: "3px 2px",
                                  borderBottom: `1px solid ${C.chalk}`,
                                }}
                              >
                                <span style={{
                                  fontSize: 12, color: C.ink, fontWeight: 700,
                                  width: 72, flexShrink: 0,
                                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                  {p.nombre.split(" ")[0]}
                                </span>

                                <span style={{
                                  fontFamily: "'DM Mono', monospace", fontSize: 13,
                                  color: hit ? HIT_COLOR[hit] : C.muted,
                                  fontWeight: hit ? 600 : 400,
                                  flexShrink: 0,
                                }}>
                                  {pm.pred.local}–{pm.pred.visitante}
                                </span>

                                <span style={{
                                  fontFamily: "'DM Mono', monospace", fontSize: 11,
                                  color: s && s.pts > 0 ? C.pitch : C.line,
                                  fontWeight: s && s.pts > 0 ? 700 : 400,
                                  flexShrink: 0, whiteSpace: "nowrap",
                                }}>
                                  {s ? `+${s.pts} pts` : "–"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
