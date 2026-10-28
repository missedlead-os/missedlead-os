/**
 * API 에러 코드가 고객 화면에 그대로 노출되지 않는지 검증한다.
 */
import { describe, expect, it } from "vitest";
import { friendlyError, isRawErrorCode, setErrorLocale } from "./errorCopy";

describe("friendlyError", () => {
  it("maps schedule and service-area codes to en/es sentences", () => {
    expect(friendlyError("schedule_outside_hours", "en")).toContain("between 7 AM and 8 PM");
    expect(friendlyError("schedule_outside_hours", "es")).toContain("entre las 7 AM y las 8 PM");
    expect(friendlyError("schedule_in_past", "en")).toMatch(/already passed/);
    expect(friendlyError("schedule_in_past", "es")).toMatch(/ya pasó/);
    expect(friendlyError("schedule_confirmation_forbidden", "en")).toMatch(/pro confirms/);
    expect(friendlyError("service_zip_unavailable", "en")).toMatch(/ZIP/);
    expect(friendlyError("service_zip_unavailable", "es")).toMatch(/código postal/);
  });

  it("never returns a raw snake_case code", () => {
    for (const code of ["service_zip_unavailable", "schedule_outside_hours", "schedule_too_far", "totally_new_server_code", "forbidden"]) {
      for (const locale of ["en", "es"] as const) {
        const message = friendlyError(code, locale);
        expect(isRawErrorCode(message)).toBe(false);
        expect(message).not.toContain("_");
      }
    }
    expect(friendlyError("totally_new_server_code", "es")).toBe("Algo salió mal. Inténtelo de nuevo.");
    expect(friendlyError("totally_new_server_code", "en", "Could not save.")).toBe("Could not save.");
  });

  it("passes human sentences through and uses the current locale by default", () => {
    expect(friendlyError("Your quote was updated.", "en")).toBe("Your quote was updated.");
    expect(friendlyError(undefined, "en")).toBe("Something went wrong. Please try again.");
    setErrorLocale("es");
    expect(friendlyError("schedule_too_far")).toMatch(/demasiado lejana/);
    setErrorLocale("en");
  });
});
