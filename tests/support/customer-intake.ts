import { expect, type Page, type Route } from "@playwright/test";

export const repairSelection = "I need a home repair. Please ask what is wrong, where it is, and any safety questions needed.";
export const repairSelectionEs = "Necesito una reparación en casa. Pregúnteme qué falla, dónde está y las preguntas de seguridad necesarias.";
export const repairPrompt = "What needs repairing, and where is it?";

export async function chooseRepair(page: Page, locale: "en" | "es" = "en") {
  const intake = page.getByTestId("customer-intake");
  await expect(intake.getByRole("textbox")).toBeHidden();
  await intake.getByRole("button", { name: locale === "es" ? /^Reparación Plomería/ : /^Repair Plumbing/ }).click();
  await expect(intake.getByRole("textbox")).toBeEditable();
  await expect(intake.getByTestId("intake-assessment")).toBeVisible();
}

// Service selection is its own analysis turn, before the scenario's message/media.
export async function handleRepairSelection(route: Route) {
  const payload = route.request().postDataBuffer()?.toString("utf8") ?? "";
  const locale = payload.includes(`"history":${JSON.stringify([{ role: "user", content: repairSelectionEs }])}`) ? "es" : "en";
  const history = JSON.stringify([{ role: "user", content: locale === "es" ? repairSelectionEs : repairSelection }]);
  if (!payload.includes(`"history":${history}`)) return false;
  const prompt = locale === "es" ? "¿Qué necesita reparar y dónde está?" : repairPrompt;
  await route.fulfill({ json: {
    reply: prompt, locale, category: "plumbing", issueCandidates: [],
    questions: [{ id: "repair-details", prompt, requiredForSafety: false }],
    safety: { level: "normal", guidance: "" }, readyToConfirm: false, assessmentToken: "service-repair",
  } });
  return true;
}

export async function viewCustomerRequests(page: Page) {
  await page.getByRole("banner")
    .getByRole("button", { name: "My requests", exact: true }).click();
  await expect(page.getByRole("combobox", { name: /^Service request/ })).toBeVisible();
}
