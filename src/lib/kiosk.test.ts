import { describe, expect, it } from "vitest";
import { describeResult, isNetworkError, isRevokedError, kioskInitials, nameInitial } from "./kiosk";

const TZ = "Europe/Rome";

describe("messaggi della timbratrice", () => {
  it("entrata e uscita con ora locale", () => {
    expect(describeResult({ ok: true, kind: "in", punched_at: "2026-10-21T06:02:00Z", first_name: "Anna" }, TZ))
      .toEqual({ tone: "in", title: "Entrata alle 08:02", detail: "Buon lavoro, Anna." });
    expect(describeResult({ ok: true, kind: "out", punched_at: "2026-10-21T15:31:00Z", first_name: "Anna" }, TZ).title)
      .toBe("Uscita alle 17:31");
  });
  it("ora solare dopo il cambio", () => {
    expect(describeResult({ ok: true, kind: "in", punched_at: "2026-10-26T07:00:00Z", first_name: "A" }, TZ).title)
      .toBe("Entrata alle 08:00");
  });
  it("doppio tocco", () => {
    const o = describeResult({ ok: true, kind: "in", punched_at: "2026-10-21T06:02:00Z", first_name: "Anna", duplicate: true }, TZ);
    expect(o.title).toBe("Entrata già registrata alle 08:02");
  });
  it("errori", () => {
    expect(describeResult({ ok: false, error: "wrong_pin" }, TZ).title).toBe("PIN non corretto");
    expect(describeResult({ ok: false, error: "locked", locked_until: "2026-10-21T06:07:00Z" }, TZ).detail).toContain("08:07");
    expect(describeResult({ ok: false, error: "no_pin" }, TZ).tone).toBe("error");
  });
  it("riconosce il tablet revocato", () => {
    expect(isRevokedError({ code: "42501", message: "Tablet non autorizzato" })).toBe(true);
    expect(isRevokedError({ code: "08006", message: "network" })).toBe(false);
    expect(isRevokedError(null)).toBe(false);
  });
});

describe("filtro per iniziale della timbratrice", () => {
  it("iniziale maiuscola e senza accenti", () => {
    expect(nameInitial("anna")).toBe("A");
    expect(nameInitial(" Élodie")).toBe("E");
    expect(nameInitial("Ùrsula")).toBe("U");
  });
  it("iniziali presenti, ordinate e senza doppioni", () => {
    expect(kioskInitials([{ first_name: "Marco" }, { first_name: "anna" }, { first_name: "Alessandro" }, { first_name: "Èrica" }]))
      .toEqual(["A", "E", "M"]);
  });
});

describe("rete assente o errore del servizio", () => {
  it("senza rete o con fetch fallita: rete", () => {
    expect(isNetworkError({ code: "P0001", message: "x" }, false)).toBe(true);
    expect(isNetworkError({ code: "", message: "TypeError: fetch failed" })).toBe(true);
    expect(isNetworkError({ message: "TypeError: Failed to fetch" })).toBe(true);
    expect(isNetworkError({ message: "Load failed" })).toBe(true); // Safari / iPad
  });
  it("risposta del database con codice o errore generico: servizio", () => {
    expect(isNetworkError({ code: "XX000", message: "internal error" })).toBe(false);
    expect(isNetworkError({ code: "", message: "Internal Server Error" })).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});
