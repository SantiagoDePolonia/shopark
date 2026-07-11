import { describe, expect, it } from "vitest";
import { addMoney, compareMoney, formatMoney, moneyEquals, parsePrice, subtractMoney } from "../money";

describe("money arithmetic", () => {
  it("adds without floating point drift", () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(addMoney(249.0, 10.99)).toBe(259.99);
  });

  it("subtracts exactly", () => {
    expect(subtractMoney(300, 259.99)).toBe(40.01);
  });

  it("compares in minor units", () => {
    expect(compareMoney(259.99, 260)).toBeLessThan(0);
    expect(compareMoney(260, 260)).toBe(0);
  });

  it("supports tolerance in equality", () => {
    expect(moneyEquals(259.99, 260.0, 1)).toBe(true);
    expect(moneyEquals(259.99, 260.02, 1)).toBe(false);
  });

  it("formats with two decimals", () => {
    expect(formatMoney(259.9, "PLN")).toBe("259.90 PLN");
  });
});

describe("parsePrice", () => {
  it("parses Polish formats", () => {
    expect(parsePrice("249,99 zł")).toEqual({ amount: 249.99, currency: "PLN" });
    expect(parsePrice("1 249,99 zł")).toEqual({ amount: 1249.99, currency: "PLN" });
  });

  it("parses dot-decimal and currency codes", () => {
    expect(parsePrice("259.99 PLN")).toEqual({ amount: 259.99, currency: "PLN" });
    expect(parsePrice("$59.99")).toEqual({ amount: 59.99, currency: "USD" });
    expect(parsePrice("€1.299,00")).toEqual({ amount: 1299, currency: "EUR" });
  });

  it("treats lone comma-thousands as thousands", () => {
    expect(parsePrice("1,299 PLN")?.amount).toBe(1299);
  });

  it("rejects garbage", () => {
    expect(parsePrice("free shipping")).toBeNull();
    expect(parsePrice("")).toBeNull();
  });
});
