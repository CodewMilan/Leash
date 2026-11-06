import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fillEndpoint, parseContacts, Refused } from "../src/core/contacts.js";
import { DEVICE_ROOT } from "../src/core/config.js";

const example = readFileSync(path.join(DEVICE_ROOT, "contacts.example.json"), "utf8");
const filledExample = () => JSON.parse(example.replaceAll("LAPTOP_IP", "192.168.1.20").replaceAll("0.0.MERCHANT", "0.0.2002"));

describe("parseContacts", () => {
  it("accepts contacts.example.json once the laptop IP and merchant account are filled in", () => {
    const contacts = parseContacts(filledExample());
    expect(contacts.map((c) => c.id)).toEqual(["chai-stall", "photographer"]);
  });

  it("rejects the example as shipped, so placeholders can't reach a payment", () => {
    expect(() => parseContacts(JSON.parse(example))).toThrow();
  });

  it("rejects an empty book, bad accounts and duplicate ids", () => {
    const [chai] = filledExample();
    expect(() => parseContacts([])).toThrow();
    expect(() => parseContacts([{ ...chai, payTo: "0xabc" }])).toThrow();
    expect(() => parseContacts([chai, { ...chai }])).toThrow(/Duplicate/);
  });
});

describe("fillEndpoint", () => {
  const [chai, photographer] = parseContacts(filledExample());

  it("fills the chai quantity, defaulting to one", () => {
    expect(fillEndpoint(chai, null, 2)).toBe("http://192.168.1.20:4021/chai?qty=2");
    expect(fillEndpoint(chai, null, null)).toBe("http://192.168.1.20:4021/chai?qty=1");
  });

  it("fills the photographer amount from the decision", () => {
    expect(fillEndpoint(photographer, "20", null)).toBe("http://192.168.1.20:4021/photo?amount=20");
  });

  it("refuses to pay the photographer without a spoken amount", () => {
    expect(() => fillEndpoint(photographer, null, null)).toThrow(Refused);
  });
});
