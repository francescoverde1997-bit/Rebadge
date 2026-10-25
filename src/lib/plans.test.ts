import { describe, expect, it } from "vitest";
import {
  dailyPerEmployeeCents, dailyPriceCents, employeeLimit, employeeRangeLabel, formatPrice, isServiceActive, mapStripeStatus,
  planForEmployees, planName, PLANS, MAX_EMPLOYEES, CUSTOM_DEFAULT_LIMIT,
} from "./plans";

const NOW = new Date("2026-10-22T10:00:00Z");

describe("piani", () => {
  it("Base 9,99 fino a 5, Plus 29,99 da 6 a 30, oltre: Personalizzato", () => {
    expect(PLANS.map((p) => [p.id, p.priceCents, p.maxEmployees])).toEqual([["base", 999, 5], ["plus", 2999, 30]]);
    expect(planForEmployees(0)!.id).toBe("base");
    expect(planForEmployees(5)!.id).toBe("base");
    expect(planForEmployees(6)!.id).toBe("plus");
    expect(planForEmployees(30)!.id).toBe("plus");
    expect(planForEmployees(31)).toBeNull();
    expect(MAX_EMPLOYEES).toBe(30);
  });
  it("le fasce sono contigue e senza buchi", () => {
    PLANS.forEach((p, i) => {
      if (i > 0) expect(p.minEmployees).toBe(PLANS[i - 1].maxEmployees + 1);
    });
  });
  it("prezzo al mese e al giorno all'italiana", () => {
    expect(formatPrice(999)).toBe("9,99 €");
    expect(formatPrice(dailyPriceCents(999))).toBe("0,33 €");
    expect(formatPrice(dailyPriceCents(2999))).toBe("0,99 €");
  });
  it("costo al giorno per dipendente", () => {
    expect(dailyPerEmployeeCents(PLANS[0], 1)).toBe(33);
    expect(dailyPerEmployeeCents(PLANS[0], 5)).toBe(7);
    expect(dailyPerEmployeeCents(PLANS[1], 30)).toBe(4);
    expect(dailyPerEmployeeCents(PLANS[1], 0)).toBe(99);
  });
  it("etichette", () => {
    expect(employeeRangeLabel(PLANS[0])).toBe("fino a 5");
    expect(employeeRangeLabel(PLANS[1])).toBe("da 6 a 30");
    expect(planName("custom")).toBe("Personalizzato");
    expect(planName("plus")).toBe("Plus");
  });
});

describe("accesso al servizio", () => {
  it("prova attiva fino alla scadenza", () => {
    expect(isServiceActive({ plan_status: "trialing", trial_ends_at: "2026-10-30T00:00:00Z", plan: null }, NOW)).toBe(true);
    expect(isServiceActive({ plan_status: "trialing", trial_ends_at: "2026-10-20T00:00:00Z", plan: null }, NOW)).toBe(false);
  });
  it("abbonamento attivo o in ritardo di pagamento: attivo; annullato: no", () => {
    const old = "2026-01-01T00:00:00Z";
    expect(isServiceActive({ plan_status: "active", trial_ends_at: old, plan: "base" }, NOW)).toBe(true);
    expect(isServiceActive({ plan_status: "past_due", trial_ends_at: old, plan: "base" }, NOW)).toBe(true);
    expect(isServiceActive({ plan_status: "canceled", trial_ends_at: old, plan: "base" }, NOW)).toBe(false);
  });
  it("limite dipendenti: 30 in prova, quello del piano dopo, su misura nel Personalizzato", () => {
    expect(employeeLimit({ plan_status: "trialing", trial_ends_at: "", plan: null })).toBe(30);
    expect(employeeLimit({ plan_status: "active", trial_ends_at: "", plan: "base" })).toBe(5);
    expect(employeeLimit({ plan_status: "active", trial_ends_at: "", plan: "plus" })).toBe(30);
    expect(employeeLimit({ plan_status: "active", trial_ends_at: "", plan: "custom", custom_employee_limit: 120 })).toBe(120);
    expect(employeeLimit({ plan_status: "active", trial_ends_at: "", plan: "custom" })).toBe(CUSTOM_DEFAULT_LIMIT);
  });
  it("stati Stripe", () => {
    expect(mapStripeStatus("active", "trialing")).toBe("active");
    expect(mapStripeStatus("past_due", "active")).toBe("past_due");
    expect(mapStripeStatus("unpaid", "past_due")).toBe("canceled");
    expect(mapStripeStatus("canceled", "active")).toBe("canceled");
    expect(mapStripeStatus("incomplete", "trialing")).toBe("trialing");
  });
});
