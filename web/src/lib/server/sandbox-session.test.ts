import { describe, expect, it } from "vitest";
import { createSession, validSession, sameOrigin } from "./sandbox-session";
describe("sandbox operator access", () => {
  it("rejects missing, altered and expired sessions", () => {
    const secret = "test-access-code-long-enough";
    const token = createSession(secret, 1000);
    expect(validSession(token, secret, 1001)).toBe(true);
    expect(validSession(token+'x', secret, 1001)).toBe(false);
    expect(validSession(token, 'other-secret', 1001)).toBe(false);
    expect(validSession(token, secret, 1000+8*60*60*1000+1)).toBe(false);
    expect(validSession(undefined, secret, 1001)).toBe(false);
  });
  it("requires an exact Origin match for writes", () => {
    expect(sameOrigin(new Request('http://localhost:3000/api/sandbox/card',{headers:{origin:'http://localhost:3000'}}))).toBe(true);
    expect(sameOrigin(new Request('http://localhost:3000/api/sandbox/card',{headers:{origin:'https://evil.example'}}))).toBe(false);
    expect(sameOrigin(new Request('http://localhost:3000/api/sandbox/card'))).toBe(false);
  });
});
