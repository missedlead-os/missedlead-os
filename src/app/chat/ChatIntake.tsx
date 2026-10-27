/**
 * 고객 접수 채팅 UI의 핵심. 메시지 송수신, 미디어 첨부, AI 후보 이슈 카드,
 * 안전 질문 게이팅, 가안 범위 확인 폼, EN/ES 번역을 처리한다.
 * localStorage에 진행 상태를 저장해 새로고침 후에도 복원한다.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CloseIcon, PaperclipIcon, PhotoIcon, SendIcon } from "./ChatIcons";
import { ApplianceIcon, ClipboardIcon, EmptyBoxIcon, HouseIcon, PlusIcon, StarIcon, WarningIcon, WrenchIcon, type IconComponent } from "../icons";

import { categoryIcon, categoryLabel, issueIcon } from "../issueIcon";
import { friendlyError } from "../errorCopy";
import { ApiFailure, demoFallbackApplies, demoRequestId, readApiBody } from "../demo";
import type { IntakeAssessment, IntakeLocale, IntakeMessage } from "./types";

type DisplayMessage = IntakeMessage & { locale: IntakeLocale; echo?: boolean; quoted?: string; note?: boolean; hidden?: boolean };
type Translation = { original: string; translated: string; sourceLocale: IntakeLocale; targetLocale: IntakeLocale; warning: string; translationToken: string };
type PendingMediaRequest = { requestId: string; assessmentToken: string };
type ServiceId = "repair" | "cleaning" | "removal" | "outdoor" | "install" | "bundle";

const serviceIcons: Record<ServiceId, IconComponent> = { repair: WrenchIcon, cleaning: StarIcon, removal: EmptyBoxIcon, outdoor: HouseIcon, install: ApplianceIcon, bundle: ClipboardIcon };
const serviceImages: Record<ServiceId, string> = {
  repair: "/img/services/repair.webp",
  cleaning: "/img/services/cleaning.webp",
  removal: "/img/services/removal.webp",
  outdoor: "/img/services/outdoor.webp",
  install: "/img/services/install.webp",
  bundle: "/img/services/bundle.webp",
};
const bundleExampleImages = [
  "/img/services/bundle-door-handle.jpg",
  "/img/services/bundle-wall-hole.jpg",
  "/img/services/bundle-cabinet-hinge.jpg",
  "/img/services/bundle-shelf-install.jpg",
];
const serviceImageHelp: Record<ServiceId, Record<IntakeLocale, string>> = {
  repair: { en: "Example: show the leak, crack, or damaged part.", es: "Ejemplo: muestre la fuga, grieta o pieza dañada." },
  cleaning: { en: "Example: show stains, dust, pet hair, or areas to clean.", es: "Ejemplo: muestre manchas, polvo, pelo de mascota o áreas para limpiar." },
  removal: { en: "Example: show the deck, junk, tree, or structure to remove.", es: "Ejemplo: muestre la terraza, objetos, árbol o estructura que desea retirar." },
  outdoor: { en: "Example: show the fence, yard, branches, or exterior problem.", es: "Ejemplo: muestre la cerca, patio, ramas o problema exterior." },
  install: { en: "Example: show the item, its parts, and where it should go.", es: "Ejemplo: muestre el artículo, sus piezas y dónde debe instalarse." },
  bundle: { en: "Example: show each small problem, such as hinges, holes, or loose hardware.", es: "Ejemplo: muestre cada problema pequeño, como bisagras, agujeros o piezas sueltas." },
};
const charlotteStreets = [
  "Central Ave, Charlotte, NC 28204", "Commonwealth Ave, Charlotte, NC 28205", "The Plaza, Charlotte, NC 28205", "South Blvd, Charlotte, NC 28203", "East Blvd, Charlotte, NC 28203", "Park Rd, Charlotte, NC 28209", "Providence Rd, Charlotte, NC 28211", "Monroe Rd, Charlotte, NC 28205", "Sharon Rd, Charlotte, NC 28210", "Tryon St, Charlotte, NC 28202",
];
const cleaningAddOns = [
  { id: "carpet", en: "Carpet shampoo", es: "Lavado de alfombra", unitEn: "room", unitEs: "habitación", low: 30, high: 70, quantity: true },
  { id: "sofa", en: "Sofa shampoo", es: "Lavado de sofá", unitEn: "sofa", unitEs: "sofá", low: 150, high: 220, quantity: true },
  { id: "garage", en: "Garage cleaning", es: "Limpieza de garaje", unitEn: "garage", unitEs: "garaje", low: 50, high: 75, quantity: false },
  { id: "filter", en: "AC filter cleaning / replacement labor", es: "Limpieza o cambio de filtro de aire", unitEn: "filter", unitEs: "filtro", low: 35, high: 60, quantity: true },
  { id: "fridge", en: "Inside refrigerator", es: "Interior del refrigerador", unitEn: "item", unitEs: "unidad", low: 35, high: 50, quantity: false },
  { id: "oven", en: "Inside oven", es: "Interior del horno", unitEn: "item", unitEs: "unidad", low: 35, high: 50, quantity: false },
  { id: "windows", en: "Interior windows", es: "Ventanas interiores", unitEn: "set", unitEs: "grupo", low: 45, high: 80, quantity: false },
  { id: "pet-hair", en: "Pet-hair deep treatment", es: "Tratamiento intensivo de pelo de mascota", unitEn: "service", unitEs: "servicio", low: 30, high: 40, quantity: false },
] as const;
const fileAccept = "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/webm,audio/mp4,audio/wav,audio/x-wav";
type StoredIntake = { messages: DisplayMessage[]; draft: string; assessment: IntakeAssessment | null; selectedIssueIds: string[]; skipQuestionIds: string[]; skipAcknowledged: boolean; uncertaintyAcknowledged: boolean; translations: Record<number, Translation>; translationsDirty: boolean; hadMedia: boolean; pendingMediaRequest: PendingMediaRequest | null };
const demoQuestions: Record<ServiceId, Record<IntakeLocale, string[]>> = {
  cleaning: {
    en: ["What type of cleaning do you need: regular, deep, or move-in/move-out?", "Which rooms or areas should be cleaned?", "About how large is the home, or how many bedrooms and bathrooms does it have?", "What date or time window works best?", "Are there any stains, buildup, pets, or special areas we should know about?"],
    es: ["¿Qué tipo de limpieza necesita: regular, profunda o de mudanza?", "¿Qué habitaciones o áreas se deben limpiar?", "¿Qué tamaño tiene la casa o cuántos dormitorios y baños tiene?", "¿Qué fecha u horario le conviene?", "¿Hay manchas, acumulación, mascotas o áreas especiales que debamos conocer?"],
  },
  repair: { en: ["What needs to be repaired, and where in the home is it?", "When did the problem start?", "Is there any water, smoke, gas smell, exposed wiring, or other immediate safety concern?"], es: ["¿Qué necesita reparar y en qué parte de la casa está?", "¿Cuándo comenzó el problema?", "¿Hay agua, humo, olor a gas, cableado expuesto u otro riesgo inmediato?"] },
  removal: { en: ["What needs to be removed?", "Approximately how large or heavy is it?", "How can the crew access it, and are there stairs, gates, or utility lines nearby?"], es: ["¿Qué necesita retirar?", "¿Qué tamaño o peso aproximado tiene?", "¿Cómo puede acceder el equipo y hay escaleras, portones o servicios públicos cerca?"] },
  outdoor: { en: ["What outdoor work do you need, and where on the property is it?", "About how large is the area?", "Is there anything that could affect access or safety?"], es: ["¿Qué trabajo exterior necesita y en qué parte de la propiedad?", "¿Qué tamaño aproximado tiene el área?", "¿Hay algo que pueda afectar el acceso o la seguridad?"] },
  install: { en: ["What needs to be installed or assembled, and where will it go?", "Do you already have the item and all included parts?", "Will it need wall mounting, plumbing, electrical, or another utility connection?"], es: ["¿Qué necesita instalar o armar y dónde irá?", "¿Ya tiene el artículo y todas sus piezas?", "¿Necesita montaje en pared, plomería, electricidad u otra conexión?"] },
  bundle: { en: ["Is there another small job you want to include in this visit?", "Which rooms are these jobs in?", "Do any tasks involve plumbing, electrical work, or heavy mounting?"], es: ["¿Hay otro trabajo pequeño que quiera incluir en esta visita?", "¿En qué habitaciones están estos trabajos?", "¿Alguna tarea incluye plomería, electricidad o montaje pesado?"] },
};

const inferService = (history: DisplayMessage[]): ServiceId => {
  const context = history.map((message) => message.content).join("\n").toLowerCase();
  return /bundle|small jobs|agrupar|trabajos pequeños/.test(context) ? "bundle"
    : /clean|limpieza/.test(context) ? "cleaning"
      : /remov|retir/.test(context) ? "removal"
        : /outdoor|exterior|jardín|yard|fence/.test(context) ? "outdoor"
          : /install|assemble|instalar|armar/.test(context) ? "install" : "repair";
};

const categoryByService: Record<ServiceId, string> = { cleaning: "cleaning", repair: "handyman", removal: "removal", outdoor: "outdoor", install: "installation", bundle: "bundle" };

const demoAssessment = (locale: IntakeLocale, content: string, history: DisplayMessage[], previous: IntakeAssessment | null): IntakeAssessment => {
  const service = inferService(history);
  const questions = demoQuestions[service][locale];
  const priorMatch = previous?.questions[0]?.id.match(/-(\d+)-of-/);
  const questionIndex = priorMatch ? Number(priorMatch[1]) : 0;
  const nextQuestion = questions[questionIndex];
  const labelByService: Record<ServiceId, Record<IntakeLocale, string>> = {
    cleaning: { en: "Deep cleaning service", es: "Servicio de limpieza profunda" }, repair: { en: "Home repair service", es: "Servicio de reparación" }, removal: { en: "Removal service", es: "Servicio de retiro" }, outdoor: { en: "Outdoor service", es: "Servicio exterior" }, install: { en: "Installation and assembly", es: "Instalación y montaje" }, bundle: { en: "Bundled small-job list", es: "Lista agrupada de trabajos pequeños" },
  };
  return {
    reply: nextQuestion ?? (locale === "es" ? "Perfecto. Revise los detalles y confirme su solicitud." : "Great. Review the details and confirm your request."),
    locale,
    issueCandidates: [{
      id: `demo-${service}`,
      label: labelByService[service][locale],
      likelihood: "medium",
      reason: content || (locale === "es" ? "Solicitud de servicio proporcionada por el cliente." : "Customer-provided service request."),
      evidenceNeeded: [locale === "es" ? "Una foto de cada área o elemento" : "A photo of each area or item"],
    }],
    questions: nextQuestion ? [{ id: `${service}-${questionIndex + 1}-of-${questions.length}`, prompt: nextQuestion, requiredForSafety: false }] : [],
    safety: { level: "normal", guidance: "" },
    readyToConfirm: !nextQuestion,
    category: categoryByService[service],
    materialsHint: service === "cleaning" ? [locale === "es" ? "Productos y equipo según las áreas confirmadas" : "Supplies and equipment based on the confirmed areas"] : [locale === "es" ? "Herramientas según la lista confirmada" : "Tools based on the confirmed task list"],
    assessmentToken: `demo-${service}-assessment`,
  };
};

type ChatIntakeProps = {
  accessToken: string;
  onCreated: (requestId: string, description: string) => Promise<void> | void;
  onLocaleChange?: (locale: IntakeLocale) => void;
  initialLocale?: IntakeLocale;
};

type Copy = {
  title: string;
  subtitle: string;
  greeting: string;
  placeholder: string;
  composerLabel: string;
  attach: string;
  send: string;
  skip: string;
  skipWarning: string;
  skipAcknowledge: string;
  skipContinue: string;
  retry: string;
  possibleIssues: string;
  tentative: string;
  materials: string;
  materialsNote: string;
  evidence: string;
  safetyRequired: string;
  confirmTitle: string;
  confirmHelp: string;
  name: string;
  address: string;
  accessNotes: string;
  pets: string;
  uncertainty: string;
  confirm: string;
  confirming: string;
  payment: string;
  fileLimits: string;
  mediaConsent: string;
  mediaPrivacy: string;
  translate: string;
  translating: string;
  saveTranslation: string;
  reattach: string;
  remove: string;
  heroTitle: string;
  heroSub: string;
  tilesLabel: string;
  tiles: { id: ServiceId; label: string; description: string; message: string }[];
  bundleTitle: string;
  bundleHelp: string;
  bundleTasks: string[];
  bundleCustom: string;
  bundleStart: string;
  bundleBack: string;
  restart: string;
  questionStep: string;
  steps: [string, string, string];
  moreIssues: string;
  fewerIssues: string;
  safetyUrgent: string;
  answerPlaceholder: string;
  skipUndo: string;
  skipNote: string;
  moreInfo: string;
  likelihood: Record<"high" | "medium" | "low", string>;
};

const copy: Record<IntakeLocale, Copy> = {
  en: {
    title: "What do you need help with?",
    subtitle: "Repair, clean, remove, install, or bundle small jobs into one visit.",
    greeting: "Hi, I’m the WeCover home service assistant. Choose a service first. Then tell us what you need and add photos, a short video, or a voice note if helpful.",
    placeholder: "Describe the service you need",
    composerLabel: "Describe the service or answer the question",
    attach: "Add photos, video, or audio",
    send: "Send",
    skip: "I’m not sure — skip",
    skipWarning: "You can skip this question, but missing details may change which pros match and the quote they provide.",
    skipAcknowledge: "I understand the quote may change.",
    skipContinue: "Skip and continue",
    retry: "Try again",
    possibleIssues: "What it might be",
    tentative: "These are possible issues based on what you shared. A technician must inspect the problem before confirming the cause.",
    materials: "Likely materials & tools",
    materialsNote: "A rough guess so the technician arrives prepared — confirmed on site.",
    evidence: "Helpful next photo or detail",
    safetyRequired: "This answer is needed for safety and can’t be skipped.",
    confirmTitle: "Review your service request",
    confirmHelp: "Choose the items that best match what you need. You can edit your name and service address before we look for local pros.",
    name: "Your name",
    address: "Service address",
    accessNotes: "Entry instructions for the service pro (optional — gate code, lockbox, call first)",
    pets: "Pets at home? (optional — dog, cat, none)",
    uncertainty: "I understand this is a provisional scope, not a confirmed diagnosis, and the final quote may change after inspection.",
    confirm: "Confirm and find local pros",
    confirming: "Looking for local pros…",
    payment: "No payment is collected during this consultation.",
    fileLimits: "Up to 10 photos, videos, or audio files. 25 MB each, 50 MB total.",
    mediaConsent: "I agree to secure AI processing of these files for this service request.",
    mediaPrivacy: "Before sending, remove faces, mail, IDs, or other private details that are not needed to show the problem.",
    translate: "Show Spanish translation",
    translating: "Translating…",
    saveTranslation: "Save translation and continue",
    reattach: "For your privacy, attached files were not saved in this browser. Add them again before continuing.",
    remove: "Remove",
    heroTitle: "First, choose the kind of help you need.",
    heroSub: "Then you can add photos for that service. A room photo alone cannot tell us whether you want cleaning, repair, removal, or installation.",
    tilesLabel: "Choose a service to continue",
    tiles: [
      { id: "repair", label: "Repair", description: "Plumbing, HVAC, electrical, and fixes", message: "I need a home repair. Please ask what is wrong, where it is, and any safety questions needed." },
      { id: "cleaning", label: "Cleaning", description: "Deep, move-out, and home cleaning", message: "I need a cleaning service. Please ask what areas need cleaning, the type of cleaning, and the approximate size." },
      { id: "removal", label: "Removal", description: "Trees, decks, junk, and old structures", message: "I need something removed from my property. Please ask what it is, its size, access conditions, and whether permits or a specialist may be needed." },
      { id: "outdoor", label: "Outdoor work", description: "Yard, fence, exterior, and seasonal jobs", message: "I need outdoor work. Please ask what area is involved, the work needed, and any access or safety concerns." },
      { id: "install", label: "Install & assemble", description: "Fixtures, furniture, appliances, and shelves", message: "I need an item installed or assembled. Please ask what the item is, where it goes, and whether mounting, utilities, or special tools are involved." },
      { id: "bundle", label: "Bundle small jobs", description: "Complete a home to-do list in one visit", message: "" },
    ],
    bundleTitle: "Build your Home To-Do Bundle",
    bundleHelp: "Select every small task you want handled in one visit. We’ll check whether one pro can safely complete the list or whether a licensed trade is needed.",
    bundleTasks: ["Adjust a door or lock", "Replace cabinet hardware", "Patch a small wall hole", "Caulk a sink, tub, or trim", "Install a shelf or blinds", "Assemble furniture"],
    bundleCustom: "Add another small task",
    bundleStart: "Start bundled request",
    bundleBack: "Back to services",
    restart: "Choose a different service",
    questionStep: "Question {current} of {total}",
    steps: ["Describe", "A few questions", "Review & confirm"],
    moreIssues: "Show more possibilities",
    fewerIssues: "Show fewer",
    safetyUrgent: "Important safety note — tap to read",
    answerPlaceholder: "Type your answer…",
    skipUndo: "Undo skip",
    skipNote: "Skipped question:",
    moreInfo: "I need a little more detail — describe what you see, or add another photo.",
    likelihood: { high: "high", medium: "medium", low: "low" },
  },
  es: {
    title: "¿Con qué necesita ayuda?",
    subtitle: "Repare, limpie, retire, instale o agrupe trabajos pequeños en una sola visita.",
    greeting: "Hola, soy el asistente de servicios para el hogar de WeCover. Primero elija un servicio. Después describa lo que necesita y añada fotos, un video corto o una nota de voz si le ayuda.",
    placeholder: "Describa el servicio que necesita",
    composerLabel: "Describa el servicio o responda la pregunta",
    attach: "Agregar fotos, video o audio",
    send: "Enviar",
    skip: "No estoy seguro — omitir",
    skipWarning: "Puede omitir esta pregunta, pero la información faltante puede cambiar los profesionales disponibles y el presupuesto.",
    skipAcknowledge: "Entiendo que el presupuesto puede cambiar.",
    skipContinue: "Omitir y continuar",
    retry: "Intentar de nuevo",
    possibleIssues: "Qué podría ser",
    tentative: "Estas son posibilidades según lo que compartió. Un técnico debe inspeccionar el problema para confirmar la causa.",
    materials: "Materiales y herramientas probables",
    materialsNote: "Una estimación para que el técnico llegue preparado — se confirma en el lugar.",
    evidence: "Próxima foto o dato útil",
    safetyRequired: "Esta respuesta es necesaria por seguridad y no se puede omitir.",
    confirmTitle: "Revise su solicitud de servicio",
    confirmHelp: "Elija los elementos que coincidan con lo que necesita. Puede editar su nombre y dirección antes de buscar profesionales locales.",
    name: "Su nombre",
    address: "Dirección del servicio",
    accessNotes: "Instrucciones de acceso para el profesional (opcional — código de portón, caja de llaves, llame primero)",
    pets: "¿Mascotas en casa? (opcional — perro, gato, ninguna)",
    uncertainty: "Entiendo que este alcance es provisional, no un diagnóstico confirmado, y que el presupuesto final puede cambiar después de la inspección.",
    confirm: "Confirmar y buscar profesionales",
    confirming: "Buscando profesionales…",
    payment: "No se cobra durante esta consulta.",
    fileLimits: "Hasta 10 fotos, videos o archivos de audio. 25 MB cada uno, 50 MB en total.",
    mediaConsent: "Acepto el procesamiento seguro con IA de estos archivos para esta solicitud de servicio.",
    mediaPrivacy: "Antes de enviar, quite rostros, correspondencia, identificaciones u otros datos privados que no sean necesarios para mostrar el problema.",
    translate: "Mostrar traducción al inglés",
    translating: "Traduciendo…",
    saveTranslation: "Guardar traducción y continuar",
    reattach: "Por su privacidad, los archivos adjuntos no se guardaron en este navegador. Agréguelos de nuevo antes de continuar.",
    remove: "Eliminar",
    heroTitle: "Primero, elija el tipo de ayuda que necesita.",
    heroSub: "Después podrá añadir fotos para ese servicio. Una foto de una habitación no indica si necesita limpieza, reparación, retiro o instalación.",
    tilesLabel: "Elija un servicio para continuar",
    tiles: [
      { id: "repair", label: "Reparación", description: "Plomería, climatización, electricidad y arreglos", message: "Necesito una reparación en casa. Pregúnteme qué falla, dónde está y las preguntas de seguridad necesarias." },
      { id: "cleaning", label: "Limpieza", description: "Limpieza profunda, de mudanza y del hogar", message: "Necesito un servicio de limpieza. Pregúnteme qué áreas, el tipo de limpieza y el tamaño aproximado." },
      { id: "removal", label: "Retiro", description: "Árboles, terrazas, basura y estructuras viejas", message: "Necesito retirar algo de mi propiedad. Pregúnteme qué es, su tamaño, el acceso y si se necesita permiso o especialista." },
      { id: "outdoor", label: "Trabajo exterior", description: "Jardín, cerca, exterior y trabajos de temporada", message: "Necesito trabajo exterior. Pregúnteme el área, el trabajo y cualquier problema de acceso o seguridad." },
      { id: "install", label: "Instalar y armar", description: "Accesorios, muebles, electrodomésticos y estantes", message: "Necesito instalar o armar algo. Pregúnteme qué es, dónde va y si requiere montaje, conexiones o herramientas especiales." },
      { id: "bundle", label: "Agrupar trabajos", description: "Complete su lista del hogar en una visita", message: "" },
    ],
    bundleTitle: "Cree su paquete de tareas del hogar",
    bundleHelp: "Seleccione todos los trabajos pequeños para una visita. Verificaremos si un profesional puede hacerlos de forma segura o si necesita un oficio con licencia.",
    bundleTasks: ["Ajustar una puerta o cerradura", "Cambiar herrajes de gabinetes", "Reparar un agujero pequeño", "Sellar fregadero, bañera o moldura", "Instalar estante o persianas", "Armar muebles"],
    bundleCustom: "Añadir otro trabajo pequeño",
    bundleStart: "Iniciar solicitud agrupada",
    bundleBack: "Volver a servicios",
    restart: "Elegir otro servicio",
    questionStep: "Pregunta {current} de {total}",
    steps: ["Describir", "Algunas preguntas", "Revisar y confirmar"],
    moreIssues: "Ver más posibilidades",
    fewerIssues: "Ver menos",
    safetyUrgent: "Nota de seguridad importante — toque para leer",
    answerPlaceholder: "Escriba su respuesta…",
    skipUndo: "Deshacer omisión",
    skipNote: "Pregunta omitida:",
    moreInfo: "Necesito un poco más de detalle — describa lo que ve o agregue otra foto.",
    likelihood: { high: "alta", medium: "media", low: "baja" },
  },
};

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime", "audio/mpeg", "audio/webm", "audio/mp4", "audio/wav", "audio/x-wav"]);
const megabyte = 1024 * 1024;
const formatSize = (bytes: number) => bytes >= megabyte ? `${(bytes / megabyte).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function accountIdFromToken(token: string) {
  try {
    const encoded = (token.split(".")[1] ?? "").replaceAll("-", "+").replaceAll("_", "/");
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="))) as { sub?: string };
    return payload.sub ?? "customer";
  } catch {
    return "customer";
  }
}

function intakeStorageKey(token: string, locale: IntakeLocale) {
  return `wecover:intake:${accountIdFromToken(token)}:${locale}`;
}

function readStoredIntake(token: string, locale: IntakeLocale): StoredIntake {
  const empty: StoredIntake = { messages: [], draft: "", assessment: null, selectedIssueIds: [], skipQuestionIds: [], skipAcknowledged: false, uncertaintyAcknowledged: false, translations: {}, translationsDirty: false, hadMedia: false, pendingMediaRequest: null };
  try {
    const saved = sessionStorage.getItem(intakeStorageKey(token, locale));
    if (!saved) return empty;
    const state = JSON.parse(saved) as Partial<StoredIntake>;
    const storedMessages = state.messages ?? empty.messages;
    const hasLegacyGreeting = storedMessages[0]?.role === "assistant" && Object.values(copy).some(({ greeting }) => greeting === storedMessages[0]?.content);
    return { ...empty, ...state, messages: hasLegacyGreeting ? storedMessages.slice(1) : storedMessages, translations: hasLegacyGreeting ? {} : state.translations ?? {}, translationsDirty: hasLegacyGreeting ? false : state.translationsDirty ?? false };
  } catch {
    return empty;
  }
}

const ERROR_COPY: Record<string, { en: string; es: string }> = {
  intake_request_in_progress: { en: "Still analyzing your previous message — please try again in a moment.", es: "Todavía estamos analizando su mensaje anterior — inténtelo de nuevo en un momento." },
  media_consent_required: { en: "Please agree to secure processing of your files before sending.", es: "Acepte el procesamiento seguro de sus archivos antes de enviar." },
  media_context_changed: { en: "Your attached files changed. Add them again and resend.", es: "Sus archivos adjuntos cambiaron. Agréguelos de nuevo y reenvíe." },
  media_total_too_large: { en: "Your files are over the 50 MB total limit.", es: "Sus archivos superan el límite total de 50 MB." },
};

function apiError(status: number, body: unknown, locale: IntakeLocale) {
  if (status === 503) return locale === "es" ? "El asistente no está disponible en este momento. Sus datos siguen aquí; inténtelo de nuevo." : "The repair assistant is temporarily unavailable. Your details are still here — please try again.";
  const code = typeof body === "object" && body && "error" in body && typeof body.error === "string" ? body.error : undefined;
  if (code && ERROR_COPY[code]) return ERROR_COPY[code][locale];
  if (code) return friendlyError(code, locale, locale === "es" ? "No pudimos procesar su mensaje. Inténtelo de nuevo." : "We couldn’t process that message. Please try again.");
  return locale === "es" ? "No pudimos procesar su mensaje. Inténtelo de nuevo." : "We couldn’t process that message. Please try again.";
}

export function ChatIntake({ accessToken, onCreated, onLocaleChange, initialLocale = "en" }: ChatIntakeProps) {
  const [initialState] = useState(() => readStoredIntake(accessToken, initialLocale));
  const [locale, setLocale] = useState<IntakeLocale>(initialLocale);
  const text = copy[locale];
  const [messages, setMessages] = useState<DisplayMessage[]>(initialState.messages);
  const [draft, setDraft] = useState(initialState.draft);
  const [files, setFiles] = useState<File[]>([]);
  const [assessment, setAssessment] = useState<IntakeAssessment | null>(initialState.assessment);
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>(initialState.selectedIssueIds);
  const [skipQuestionIds, setSkipQuestionIds] = useState<string[]>(initialState.skipQuestionIds);
  const [skipAcknowledged, setSkipAcknowledged] = useState(initialState.skipAcknowledged);
  const [uncertaintyAcknowledged, setUncertaintyAcknowledged] = useState(initialState.uncertaintyAcknowledged);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [mediaConsent, setMediaConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<(() => Promise<void>) | null>(null);
  const [confirmationRetry, setConfirmationRetry] = useState<(() => Promise<void>) | null>(null);
  const [translations, setTranslations] = useState<Record<number, Translation>>(initialState.translations);
  const [translationsDirty, setTranslationsDirty] = useState(initialState.translationsDirty);
  const [requiresReattach, setRequiresReattach] = useState(initialState.hadMedia);
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [pendingMediaRequest, setPendingMediaRequest] = useState<PendingMediaRequest | null>(initialState.pendingMediaRequest);
  const [bundleOpen, setBundleOpen] = useState(false);
  const [openServiceExample, setOpenServiceExample] = useState<ServiceId | null>(null);
  const [bundleTasks, setBundleTasks] = useState<string[]>([]);
  const [bundleCustom, setBundleCustom] = useState("");
  const [serviceAddress, setServiceAddress] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTimeWindow, setPreferredTimeWindow] = useState("");
  const [selectedCleaningAddOns, setSelectedCleaningAddOns] = useState<Record<string, number | "">>({});
  const logRef = useRef<HTMLDivElement>(null);
  const storageKey = intakeStorageKey(accessToken, locale);
  const openQuestions = assessment?.questions.filter((question) => !skipQuestionIds.includes(question.id)) ?? [];
  const activeQuestion = assessment && !assessment.readyToConfirm ? openQuestions[0] : undefined;
  const asksForSchedule = Boolean(activeQuestion && /date|time window|fecha|horario/i.test(activeQuestion.prompt));
  const requiresAnswer = Boolean(activeQuestion && (activeQuestion.requiredForSafety || asksForSchedule || /what type of cleaning|which rooms or areas|what needs to be (?:repaired|removed|installed)|what outdoor work|qué tipo de limpieza|qué habitaciones|qué necesita (?:reparar|retirar|instalar)|qué trabajo exterior/i.test(activeQuestion.prompt)));
  const timeWindows = locale === "es" ? ["Mañana", "Tarde", "Noche", "Flexible"] : ["Morning", "Afternoon", "Evening", "Flexible"];
  const showDiagnosticAssessment = Boolean(assessment && !["cleaning", "removal", "outdoor", "installation", "bundle"].includes(assessment.category ?? ""));
  const showComposer = messages.length > 0 || Boolean(assessment) || files.length > 0;
  const cleaningEstimate = useMemo(() => cleaningAddOns.reduce((total, addOn) => {
    const quantity = Number(selectedCleaningAddOns[addOn.id]) || 0;
    return { low: total.low + addOn.low * quantity, high: total.high + addOn.high * quantity };
  }, { low: 230, high: 420 }), [selectedCleaningAddOns]);
  const cleaningAnswers = useMemo(() => messages.filter((message) => message.role === "user" && !message.hidden).map((message) => ({ question: message.quoted, answer: message.content })), [messages]);
  const addressSuggestions = useMemo(() => {
    const match = serviceAddress.trim().match(/^(\d+)\s*(.*)$/);
    if (!match || !match[2]) return [];
    if (charlotteStreets.some((street) => serviceAddress.trim() === `${match[1]} ${street}`)) return [];
    const streetQuery = match[2].toLowerCase();
    return charlotteStreets.filter((street) => street.toLowerCase().startsWith(streetQuery)).slice(0, 5).map((street) => `${match[1]} ${street}`);
  }, [serviceAddress]);

  useEffect(() => {
    if (!messages.length && !assessment && !error) {
      if (logRef.current) logRef.current.scrollTop = 0;
      return;
    }
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, assessment, error]);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ messages, draft, assessment, selectedIssueIds, skipQuestionIds, skipAcknowledged, uncertaintyAcknowledged, translations, translationsDirty, hadMedia: files.length > 0 || requiresReattach, pendingMediaRequest }));
    } catch { return; }
  }, [assessment, draft, files.length, messages, pendingMediaRequest, requiresReattach, selectedIssueIds, skipAcknowledged, skipQuestionIds, storageKey, translations, translationsDirty, uncertaintyAcknowledged]);

  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  const changeLocale = (next: IntakeLocale) => {
    const state = readStoredIntake(accessToken, next);
    setLocale(next);
    onLocaleChange?.(next);
    setMessages(state.messages); setDraft(state.draft); setAssessment(state.assessment); setSelectedIssueIds(state.selectedIssueIds); setSkipQuestionIds(state.skipQuestionIds); setSkipAcknowledged(state.skipAcknowledged); setUncertaintyAcknowledged(state.uncertaintyAcknowledged); setTranslations(state.translations); setTranslationsDirty(state.translationsDirty); setRequiresReattach(state.hadMedia); setPendingMediaRequest(state.pendingMediaRequest); setFiles([]); setMediaConsent(false); setError(""); setFileError(""); setLastAttempt(null); setConfirmationRetry(null); setShowAllIssues(false); setBundleOpen(false); setBundleTasks([]); setBundleCustom(""); setPreferredDate(""); setPreferredTimeWindow("");
  };

  const restartIntake = () => {
    try { sessionStorage.removeItem(storageKey); } catch { /* State reset below still returns the user to service selection. */ }
    setMessages([]); setDraft(""); setFiles([]); setAssessment(null); setSelectedIssueIds([]); setSkipQuestionIds([]); setSkipAcknowledged(false); setUncertaintyAcknowledged(false); setTranslations({}); setTranslationsDirty(false); setRequiresReattach(false); setPendingMediaRequest(null); setMediaConsent(false); setError(""); setFileError(""); setLastAttempt(null); setConfirmationRetry(null); setShowAllIssues(false); setBundleOpen(false); setBundleTasks([]); setBundleCustom(""); setServiceAddress(""); setPreferredDate(""); setPreferredTimeWindow(""); setSelectedCleaningAddOns({});
    requestAnimationFrame(() => { if (logRef.current) logRef.current.scrollTop = 0; });
  };

  const addFiles = (incoming: File[]) => {
    const next = [...files, ...incoming];
    if (next.length > 10) return setFileError(locale === "es" ? "Puede adjuntar hasta 10 archivos." : "You can attach up to 10 files.");
    if (next.some((file) => !allowedTypes.has(file.type))) return setFileError(locale === "es" ? "Uno de los archivos tiene un formato no compatible." : "One of those files isn’t a supported photo or video format.");
    if (next.some((file) => file.size > 25 * megabyte)) return setFileError(locale === "es" ? "Cada archivo debe pesar 25 MB o menos." : "Each file must be 25 MB or smaller.");
    if (next.reduce((sum, file) => sum + file.size, 0) > 50 * megabyte) return setFileError(locale === "es" ? "Los archivos deben pesar 50 MB o menos en total." : "Your files must be 50 MB or less in total.");
    setFileError("");
    setFiles(next);
    setRequiresReattach(false);
  };

  const runAnalysis = async (userContent?: string, skippedIds = skipQuestionIds, hideUserMessage = false) => {
    const trimmed = userContent?.trim() ?? "";
    if (!trimmed && skippedIds.length === 0 && files.length === 0 && !translationsDirty) return;
    const attachmentNote = files.length ? `${files.length} ${locale === "es" ? "archivo(s) adjunto(s)" : "attachment(s) included"}` : "";
    const content = [trimmed, attachmentNote].filter(Boolean).join("\n");
    const answeredQuestion = trimmed ? assessment?.questions.find((question) => !skippedIds.includes(question.id)) : undefined;
    const quoted = answeredQuestion?.prompt;
    const noteMessages = (assessment?.questions ?? []).filter((question) => skippedIds.includes(question.id)).map((question) => ({ role: "assistant" as const, content: `${text.skipNote} ${question.prompt}`, locale, echo: true, note: true }));
    const nextMessages = [...messages, ...noteMessages, ...(content ? [{ role: "user" as const, content, locale, quoted, hidden: hideUserMessage }] : [])];

    const attempt = async () => {
      setBusy(true);
      setError("");
      if (nextMessages.length !== messages.length) setMessages(nextMessages);
      try {
        const form = new FormData();
        form.append("payload", JSON.stringify({
          locale,
          history: nextMessages.filter((message) => !message.echo).map(({ role, content: messageContent }) => ({ role, content: messageContent })),
          previousAssessmentToken: assessment?.assessmentToken,
          skipped: skippedIds.length ? { questionIds: skippedIds, warningAcknowledged: skipAcknowledged } : undefined,
          mediaConsent: files.length ? mediaConsent : undefined,
          translations: Object.values(translations).filter(({ translationToken }) => Boolean(translationToken)).map(({ original, translated, sourceLocale, targetLocale, translationToken }) => ({ original, translated, sourceLocale, targetLocale, translationToken })),
        }));
        files.forEach((file) => form.append("media", file, file.name));
        const body = await fetch("/api/intake/analyze", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: form, signal: AbortSignal.timeout(75_000) }).then(async (response) => {
          const { body: result, structured } = await readApiBody<IntakeAssessment & { error?: string }>(response);
          if (!response.ok) throw new ApiFailure(apiError(response.status, result, locale), response.status, structured);
          return result;
        }).catch((caught: unknown) => {
          // Role test buttons keep working when the assistant API is unreachable.
          if (!demoFallbackApplies(accessToken, caught)) throw caught;
          return demoAssessment(locale, content, nextMessages, assessment);
        });
        const selectedService = inferService(nextMessages);
        const displayAssessment = selectedService === "repair" ? body : { ...body, category: categoryByService[selectedService] };
        setAssessment(displayAssessment);
        setMessages([...nextMessages, { role: "assistant", content: displayAssessment.reply, locale: displayAssessment.locale }]);
        setSelectedIssueIds(displayAssessment.issueCandidates.filter((candidate) => candidate.likelihood !== "low").map((candidate) => candidate.id));
        setSkipQuestionIds([]);
        setSkipAcknowledged(false);
        setShowAllIssues(false);
        setTranslationsDirty(false);
        setDraft("");
      } catch (caught) {
        const timedOut = caught instanceof Error && (caught.name === "TimeoutError" || caught.name === "AbortError");
        setError(timedOut ? (locale === "es" ? "La respuesta está tardando demasiado. Inténtelo de nuevo." : "The response is taking too long. Please try again.") : caught instanceof Error ? caught.message : apiError(500, {}, locale));
      } finally {
        setBusy(false);
      }
    };

    setLastAttempt(() => attempt);
    await attempt();
  };

  const chooseSkip = (questionId: string) => {
    setSkipQuestionIds((current) => current.includes(questionId) ? current.filter((id) => id !== questionId) : [...current, questionId]);
    setSkipAcknowledged(false);
  };

  const toggleBundleTask = (task: string) => {
    setBundleTasks((current) => current.includes(task) ? current.filter((item) => item !== task) : [...current, task]);
  };

  const toggleCleaningAddOn = (id: string) => {
    setSelectedCleaningAddOns((current) => Object.hasOwn(current, id) ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)) : { ...current, [id]: 1 });
  };

  const submitBundle = () => {
    const custom = bundleCustom.trim();
    const tasks = [...bundleTasks, ...(custom ? [custom] : [])];
    if (!tasks.length) return;
    const intro = locale === "es"
      ? "Quiero agrupar estos trabajos pequeños en una sola visita:"
      : "I want to bundle these small jobs into one visit:";
    void runAnalysis(`${intro}\n${tasks.map((task) => `- ${task}`).join("\n")}`, skipQuestionIds, true);
  };

  const confirmRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assessment?.assessmentToken) return;
    const form = new FormData(event.currentTarget);
    const scopeDetails = {
      ...(String(form.get("accessNotes") ?? "").trim() ? { access: String(form.get("accessNotes")).trim() } : {}),
      ...(String(form.get("pets") ?? "").trim() ? { pets: String(form.get("pets")).trim() } : {}),
      ...(assessment.category === "cleaning" ? { serviceAnswers: cleaningAnswers, cleaningAddOns: selectedCleaningAddOns, estimatedRange: cleaningEstimate } : {}),
    };
    setConfirming(true);
    setError("");
    try {
      let pending = pendingMediaRequest;
      if (!pending) {
        const requestId = await fetch("/api/intake/confirm", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ assessmentToken: assessment.assessmentToken, acceptedIssueIds: selectedIssueIds, warningAcknowledged: uncertaintyAcknowledged, customerName: form.get("customerName"), address: form.get("address"), ...(Object.keys(scopeDetails).length > 0 ? { scopeDetails } : {}) }),
          signal: AbortSignal.timeout(30_000),
        }).then(async (response) => {
          const { body, structured } = await readApiBody<{ requestId?: string; error?: string }>(response);
          if (!response.ok || !body.requestId) throw new ApiFailure(apiError(response.status, body, locale), response.status, structured);
          return body.requestId;
        }).catch((caught: unknown) => {
          if (!demoFallbackApplies(accessToken, caught)) throw caught;
          return demoRequestId();
        });
        pending = { requestId, assessmentToken: assessment.assessmentToken };
        setPendingMediaRequest(pending);
      }
      const finish = async () => {
        if (requiresReattach) throw new Error(text.reattach);
        if (files.length > 0) {
          const upload = new FormData();
          upload.append("assessmentToken", pending.assessmentToken);
          files.forEach((file) => upload.append("media", file, file.name));
          await fetch(`/api/requests/${pending.requestId}/intake-media`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: upload, signal: AbortSignal.timeout(120_000) }).then(async (uploadResponse) => {
            const { body: uploadBody, structured } = await readApiBody<{ error?: string }>(uploadResponse);
            if (!uploadResponse.ok) throw new ApiFailure(apiError(uploadResponse.status, uploadBody, locale), uploadResponse.status, structured);
          }).catch((caught: unknown) => {
            // A local demo walkthrough keeps the attachments client-side only.
            if (!demoFallbackApplies(accessToken, caught)) throw caught;
          });
        }
        sessionStorage.removeItem(storageKey);
        setPendingMediaRequest(null);
        setConfirmationRetry(null);
        const selectedDescriptions = assessment.issueCandidates.filter((issue) => selectedIssueIds.includes(issue.id)).map((issue) => issue.label);
        const requestDescription = selectedDescriptions.join(", ") || assessment.issueCandidates[0]?.label || (locale === "es" ? "Solicitud de servicio del hogar" : "Home service request");
        await onCreated(pending.requestId, requestDescription);
      };
      setConfirmationRetry(() => finish);
      await finish();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : apiError(500, {}, locale));
    } finally {
      setConfirming(false);
    }
  };

  return <section className="chat-intake" data-testid="customer-intake" aria-labelledby="intake-title">
    <div className={`intake-backbar${messages.length > 0 || assessment || bundleOpen ? "" : " intake-backbar--empty"}`}>{(messages.length > 0 || assessment || bundleOpen) && <button type="button" className="intake-restart" onClick={restartIntake}>← {text.restart}</button>}</div>
    <header className="chat-intake__header">
      <div><p className="chat-intake__kicker">WECOVER HOME SERVICES</p><h1 id="intake-title">{text.title}</h1><p>{text.subtitle}</p></div>
      <div className="language-switch" role="group" aria-label="Language"><button type="button" aria-pressed={locale === "en"} onClick={() => changeLocale("en")}>EN</button><button type="button" aria-pressed={locale === "es"} onClick={() => changeLocale("es")}>ES</button></div>
    </header>

    <ol className="intake-steps" aria-label={locale === "es" ? "Progreso" : "Progress"}>
      {text.steps.map((step, index) => {
        const stage = !assessment ? (messages.length ? 1 : 0) : assessment.readyToConfirm ? 2 : 1;
        const state = index < stage ? "done" : index === stage ? "current" : "todo";
        return <li key={step} className={`intake-steps__step intake-steps__step--${state}`} aria-current={state === "current" ? "step" : undefined}><span className="intake-steps__dot"/>{step}</li>;
      })}
    </ol>
    <div className="chat-log" ref={(node) => { logRef.current = node; if (node && !messages.length && !assessment) node.scrollTop = 0; }} role="log" aria-live="polite" aria-relevant="additions">
      <div className="chat-message chat-message--assistant"><span className="chat-message__sender">WeCover</span><p>{text.greeting}</p></div>
      {messages.length === 0 && !assessment && <>
        <div className="intake-hero">
          <div className="intake-hero__body"><h2>{text.heroTitle}</h2><p>{text.heroSub}</p></div>
        </div>
        {!bundleOpen ? <div className="service-picker"><span className="service-picker__label">{text.tilesLabel}</span><div className="service-grid">{text.tiles.map((tile) => { const TileIcon = serviceIcons[tile.id]; const exampleOpen = openServiceExample === tile.id; return <div key={tile.id} className={tile.id === "bundle" ? "service-card-shell service-card-shell--bundle" : "service-card-shell"}><button type="button" className={tile.id === "bundle" ? "service-card service-card--bundle" : "service-card"} onClick={() => { setOpenServiceExample(null); if (tile.id === "bundle") setBundleOpen(true); else void runAnalysis(tile.message, skipQuestionIds, true); }}><span className="service-card__icon"><TileIcon size={22}/></span><span className="service-card__copy"><strong>{tile.label}</strong><small>{tile.description}</small></span>{tile.id === "bundle" && <span className="service-card__badge">{locale === "es" ? "AGRUPA Y AHORRA" : "BUNDLE & SAVE"}</span>}</button><button type="button" className="service-card__example-trigger" aria-label={`${tile.label}: ${locale === "es" ? "ver ejemplo de foto" : "view photo example"}`} aria-expanded={exampleOpen} aria-describedby={`service-example-${tile.id}`} onClick={() => setOpenServiceExample(exampleOpen ? null : tile.id)}>?</button><span id={`service-example-${tile.id}`} role="tooltip" className={`service-card__example${tile.id === "bundle" ? " service-card__example--bundle" : ""}${exampleOpen ? " service-card__example--open" : ""}`}>{tile.id === "bundle" ? <span className="service-card__example-grid">{bundleExampleImages.map((image) => <img key={image} src={image} alt=""/>)}</span> : <img src={serviceImages[tile.id]} alt=""/>}<span>{serviceImageHelp[tile.id][locale]}</span></span></div>; })}</div></div> : <section className="bundle-builder" aria-labelledby="bundle-title"><button type="button" className="bundle-builder__back" onClick={() => setBundleOpen(false)}>← {text.bundleBack}</button><div className="bundle-builder__heading"><span className="service-card__icon"><ClipboardIcon size={22}/></span><div><h2 id="bundle-title">{text.bundleTitle}</h2><p>{text.bundleHelp}</p></div></div><div className="bundle-task-grid">{text.bundleTasks.map((task) => <label key={task} className={bundleTasks.includes(task) ? "selected" : ""}><input type="checkbox" checked={bundleTasks.includes(task)} onChange={() => toggleBundleTask(task)}/><span>{task}</span></label>)}</div><label className="bundle-builder__custom"><span>{text.bundleCustom}</span><input value={bundleCustom} onChange={(event) => setBundleCustom(event.target.value)} placeholder={locale === "es" ? "Ej.: cambiar dos pomos" : "Example: Replace two doorknobs"}/></label><button type="button" className="primary bundle-builder__submit" disabled={!bundleTasks.length && !bundleCustom.trim()} onClick={submitBundle}><PlusIcon size={18}/>{text.bundleStart}</button></section>}
      </>}
      {messages.map((message, index) => {
        if (message.hidden) return null;
        if (message.note) return <div className="chat-note" key={`note-${index}`}>{message.content}</div>;
        const next = messages[index + 1];
        const hasPendingCard = index === messages.length - 1 && Boolean(activeQuestion);
        const hasQuotedAnswer = next?.role === "user" && Boolean(next.quoted);
        const content = message.role === "assistant" && (hasPendingCard || hasQuotedAnswer) ? message.content.replace(/[^.!?]*\?/g, "").replace(/\s{2,}/g, " ").trim() : message.content;
        if (!content) return null;
        return <div className={`chat-message chat-message--${message.role}`} key={`${message.role}-${index}`}><span className="chat-message__sender">{message.role === "assistant" ? "WeCover" : locale === "es" ? "Usted" : "You"}</span><p>{message.quoted && <small className="chat-message__quote">{message.quoted}</small>}{content}</p></div>;
      })}
      {busy && <div className="chat-message chat-message--assistant chat-message--thinking" aria-label={locale === "es" ? "Analizando" : "Analyzing"}><span/><span/><span/></div>}

      {assessment && !busy && <div className="assessment" data-testid="intake-assessment">
        {assessment.safety.level === "emergency" && <div className="safety-guidance safety-guidance--emergency" role="alert"><WarningIcon size={22}/><div><strong>{locale === "es" ? "Posible emergencia" : "Possible emergency"}</strong><p>{assessment.safety.guidance}</p></div></div>}
        {assessment.safety.level !== "normal" && assessment.safety.level !== "emergency" && <details className={`safety-guidance safety-guidance--${assessment.safety.level} safety-collapsible`}><summary><WarningIcon size={18}/><strong>{text.safetyUrgent}</strong></summary><p>{assessment.safety.guidance}</p></details>}
        {showDiagnosticAssessment && assessment.issueCandidates.length > 0 && !assessment.readyToConfirm && <section className="possible-issues" aria-labelledby="possible-issues-title"><h2 id="possible-issues-title">{text.possibleIssues}</h2>{assessment.category && (() => { const CatIcon = categoryIcon(assessment.category); return <span className="category-chip"><CatIcon size={13}/>{categoryLabel(assessment.category, locale)}</span>; })()}<p className="tentative-note">{text.tentative}</p>{(showAllIssues ? assessment.issueCandidates : assessment.issueCandidates.slice(0, 2)).map((candidate) => { const CandidateIcon = issueIcon(candidate.label); return <article key={candidate.id}><span className="issue-icon"><CandidateIcon size={20}/></span><div className="issue-body"><div><strong>{candidate.label}</strong><span className={`likelihood likelihood--${candidate.likelihood}`}>{text.likelihood[candidate.likelihood] ?? candidate.likelihood}</span></div><p>{candidate.reason}</p>{candidate.evidenceNeeded.length > 0 && <small><PhotoIcon size={16}/>{text.evidence}: {candidate.evidenceNeeded.join(", ")}</small>}</div></article>; })}{assessment.issueCandidates.length > 2 && <button type="button" className="issues-more" onClick={() => setShowAllIssues((value) => !value)}>{showAllIssues ? text.fewerIssues : `${text.moreIssues} (${assessment.issueCandidates.length - 2})`}</button>}{(assessment.materialsHint?.length ?? 0) > 0 && <div className="materials-hint"><strong><WrenchIcon size={14}/>{text.materials}</strong><p>{assessment.materialsHint!.join(" · ")}</p><small>{text.materialsNote}</small></div>}</section>}
        {assessment.category === "cleaning" && !assessment.readyToConfirm && activeQuestion?.id !== "cleaning-1-of-5" && <section className="cleaning-options" aria-labelledby="cleaning-options-title"><div><p className="eyebrow">{locale === "es" ? "SERVICIOS ADICIONALES" : "CLEANING ADD-ONS"}</p><h2 id="cleaning-options-title">{locale === "es" ? "¿Quiere añadir algo?" : "Would you like to add anything?"}</h2><p>{locale === "es" ? "Seleccione todo lo que necesite. Puede cambiarlo antes de confirmar." : "Select everything you need. You can change this before confirming."}</p></div><div className="cleaning-options__grid">{cleaningAddOns.map((addOn) => { const selected = Object.hasOwn(selectedCleaningAddOns, addOn.id); const quantity = selectedCleaningAddOns[addOn.id] ?? ""; return <div className={`cleaning-option${selected ? " cleaning-option--selected" : ""}`} key={addOn.id}><label><input type="checkbox" checked={selected} onChange={() => toggleCleaningAddOn(addOn.id)}/><span><strong>{locale === "es" ? addOn.es : addOn.en}</strong><small>+${addOn.low}–${addOn.high}{addOn.quantity ? ` / ${locale === "es" ? addOn.unitEs : addOn.unitEn}` : ""}</small></span></label>{selected && addOn.quantity && <label className="cleaning-option__quantity"><span>{locale === "es" ? "Cantidad" : "Quantity"}</span><input type="number" min="1" max="20" value={quantity} onChange={(event) => { const value = event.target.value; setSelectedCleaningAddOns((current) => ({ ...current, [addOn.id]: value === "" ? "" : Math.min(20, Math.max(1, Number(value))) })); }} onBlur={() => setSelectedCleaningAddOns((current) => current[addOn.id] === "" ? { ...current, [addOn.id]: 1 } : current)}/></label>}</div>; })}</div><div className="cleaning-estimate"><span>{locale === "es" ? "Estimado típico en Charlotte" : "Typical Charlotte estimate"}</span><strong>${cleaningEstimate.low}–${cleaningEstimate.high}</strong><small>{locale === "es" ? "Estimación, no precio final. El profesional confirma el alcance y el presupuesto." : "Estimate, not a final price. The pro confirms the scope and quote."}</small></div></section>}
        {activeQuestion && <section className="followup-questions" aria-label={locale === "es" ? "Pregunta de seguimiento" : "Follow-up question"}><p className="question-progress">{(() => { const demoProgress = activeQuestion.id.match(/-(\d+)-of-(\d+)$/); return text.questionStep.replace("{current}", demoProgress?.[1] ?? String(assessment.questions.length - openQuestions.length + 1)).replace("{total}", demoProgress?.[2] ?? String(assessment.questions.length)); })()}</p><article key={activeQuestion.id}><p>{activeQuestion.prompt}</p>{asksForSchedule && <div className="schedule-picker"><label><span>{locale === "es" ? "Fecha preferida" : "Preferred date"}</span><input type="date" min={new Date().toISOString().slice(0, 10)} value={preferredDate} onChange={(event) => setPreferredDate(event.target.value)}/></label><fieldset><legend>{locale === "es" ? "Horario preferido" : "Preferred time"}</legend><div>{timeWindows.map((window) => <button type="button" key={window} className={preferredTimeWindow === window ? "selected" : ""} aria-pressed={preferredTimeWindow === window} onClick={() => setPreferredTimeWindow(window)}>{window}</button>)}</div></fieldset><button type="button" className="primary schedule-picker__submit" disabled={!preferredDate || !preferredTimeWindow} onClick={() => { const answer = locale === "es" ? `Fecha preferida: ${preferredDate}. Horario: ${preferredTimeWindow}.` : `Preferred date: ${preferredDate}. Time window: ${preferredTimeWindow}.`; setPreferredDate(""); setPreferredTimeWindow(""); void runAnalysis(answer); }}>{locale === "es" ? "Usar esta fecha y hora" : "Use this date and time"}</button></div>}{activeQuestion.requiredForSafety ? <small className="required-safety">{text.safetyRequired}</small> : requiresAnswer ? <small className="required-answer">{locale === "es" ? "Obligatorio para continuar" : "Required to continue"}</small> : <button type="button" className={skipQuestionIds.includes(activeQuestion.id) ? "selected" : ""} onClick={() => chooseSkip(activeQuestion.id)}>{text.skip}</button>}</article></section>}
        {!activeQuestion && !assessment.readyToConfirm && assessment.safety.level !== "emergency" && <p className="intake-nudge" role="note">{text.moreInfo}</p>}
        {skipQuestionIds.length > 0 && <div className="skip-warning" role="note"><div className="skip-undos">{assessment.questions.filter((question) => skipQuestionIds.includes(question.id)).map((question) => <button key={question.id} type="button" className="skip-undo" onClick={() => chooseSkip(question.id)}><span>{text.skipUndo}</span>{question.prompt}</button>)}</div><p>{text.skipWarning}</p><label><input type="checkbox" checked={skipAcknowledged} onChange={(event) => setSkipAcknowledged(event.target.checked)}/>{text.skipAcknowledge}</label><button type="button" disabled={!skipAcknowledged} onClick={() => void runAnalysis(undefined, skipQuestionIds)}>{text.skipContinue}</button></div>}
        {translationsDirty && <div className="translation-sync"><button type="button" onClick={() => void runAnalysis()} disabled={busy || requiresReattach}>{text.saveTranslation}</button></div>}
        {assessment.readyToConfirm && assessment.category === "cleaning" && <section className="cleaning-summary"><div><p className="eyebrow">{locale === "es" ? "RESUMEN PARA EL PROFESIONAL" : "SUMMARY FOR THE PRO"}</p><h2>{locale === "es" ? "Su solicitud de limpieza" : "Your cleaning request"}</h2><p>{locale === "es" ? "Esto se enviará al profesional con su solicitud." : "This will be sent to the pro with your request."}</p></div><dl>{cleaningAnswers.map((item, index) => <div key={`${item.question}-${index}`}><dt>{item.question ?? (locale === "es" ? "Detalle" : "Detail")}</dt><dd>{item.answer}</dd></div>)}</dl>{Object.keys(selectedCleaningAddOns).length > 0 && <div className="cleaning-summary__addons"><strong>{locale === "es" ? "Servicios adicionales" : "Add-ons"}</strong><ul>{cleaningAddOns.filter((addOn) => Object.hasOwn(selectedCleaningAddOns, addOn.id)).map((addOn) => { const quantity = Number(selectedCleaningAddOns[addOn.id]) || 1; return <li key={addOn.id}><span>{locale === "es" ? addOn.es : addOn.en}{addOn.quantity ? ` × ${quantity}` : ""}</span><b>+${addOn.low * quantity}–${addOn.high * quantity}</b></li>; })}</ul></div>}<div className="cleaning-estimate"><span>{locale === "es" ? "Estimado típico en Charlotte" : "Typical Charlotte estimate"}</span><strong>${cleaningEstimate.low}–${cleaningEstimate.high}</strong><small>{locale === "es" ? "No es un precio final. El profesional confirmará el alcance y el presupuesto." : "Not a final price. The pro will confirm the scope and quote."}</small></div></section>}
        {assessment.readyToConfirm && assessment.assessmentToken && assessment.safety.level !== "emergency" && <form className="confirm-request" onSubmit={confirmRequest}><div><h2>{text.confirmTitle}</h2><p>{text.confirmHelp}</p></div>{assessment.details?.desiredTimeLabel && <p className="visit-preference" data-testid="visit-preference"><strong>{locale === "es" ? "Horario preferido" : "Preferred visit"}:</strong> {assessment.details.desiredTimeLabel}<small> — {locale === "es" ? "se envía como propuesta; el técnico la confirma." : "sent as a proposal; your pro confirms it."}</small></p>}{showDiagnosticAssessment && <><fieldset><legend>{text.possibleIssues}{assessment.category && (() => { const CatIcon = categoryIcon(assessment.category); return <span className="category-chip"><CatIcon size={13}/>{categoryLabel(assessment.category, locale)}</span>; })()}</legend>{assessment.issueCandidates.map((candidate) => { const CandidateIcon = issueIcon(candidate.label); return <label key={candidate.id}><input type="checkbox" checked={selectedIssueIds.includes(candidate.id)} onChange={(event) => setSelectedIssueIds((current) => event.target.checked ? [...current, candidate.id] : current.filter((id) => id !== candidate.id))}/><span className="issue-icon"><CandidateIcon size={18}/></span><span><strong>{candidate.label}</strong><small>{candidate.reason}</small></span></label>; })}</fieldset>{(assessment.materialsHint?.length ?? 0) > 0 && <div className="materials-hint"><strong><WrenchIcon size={14}/>{text.materials}</strong><p>{assessment.materialsHint!.join(" · ")}</p><small>{text.materialsNote}</small></div>}</>}<label>{text.name}<input name="customerName" autoComplete="name" required/></label><label className="address-field"><span>{text.address}</span><input name="address" autoComplete="street-address" value={serviceAddress} onChange={(event) => setServiceAddress(event.target.value)} required/>{addressSuggestions.length > 0 && <span className="address-suggestions" role="listbox" aria-label={locale === "es" ? "Direcciones sugeridas" : "Suggested addresses"}>{addressSuggestions.map((suggestion) => <button type="button" role="option" key={suggestion} onMouseDown={(event) => event.preventDefault()} onClick={() => setServiceAddress(suggestion)}>{suggestion}</button>)}</span>}</label><label>{text.accessNotes}<input name="accessNotes" autoComplete="off"/></label><label>{text.pets}<input name="pets" autoComplete="off"/></label><label className="confirm-request__ack"><input type="checkbox" checked={uncertaintyAcknowledged} onChange={(event) => setUncertaintyAcknowledged(event.target.checked)} required/><span>{assessment.uncertaintyWarning ?? text.uncertainty}</span></label><button className="primary confirm-request__submit" disabled={confirming || selectedIssueIds.length === 0 || requiresReattach || translationsDirty}>{confirming ? text.confirming : text.confirm}</button></form>}
      </div>}
      {error && <div className="chat-error" role="alert"><p>{error}</p>{(confirmationRetry || lastAttempt) && <button type="button" onClick={() => void (confirmationRetry ?? lastAttempt)?.()} disabled={busy || confirming || requiresReattach}>{text.retry}</button>}</div>}
    </div>

    <div className={`chat-composer${showComposer ? "" : " chat-composer--hidden"}`} aria-hidden={!showComposer}>
      {files.length > 0 && <div className="attachment-tray" aria-label={locale === "es" ? "Archivos adjuntos" : "Attachments"}>{files.map((file, index) => <div className="attachment" key={`${file.name}-${file.lastModified}`}><PhotoIcon size={18}/><span><strong>{file.name}</strong><small>{formatSize(file.size)}</small></span><button type="button" aria-label={`${text.remove} ${file.name}`} onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}><CloseIcon/></button></div>)}</div>}
      {files.length > 0 && <div className="media-consent"><p>{text.mediaPrivacy}</p><label><input type="checkbox" checked={mediaConsent} onChange={(event) => setMediaConsent(event.target.checked)}/><span>{text.mediaConsent}</span></label></div>}
      {fileError && <p className="file-error" role="alert">{fileError}</p>}
      {requiresReattach && <p className="reattach-notice" role="alert">{text.reattach}</p>}
      <form onSubmit={(event) => { event.preventDefault(); void runAnalysis(draft); }}>
        <label className="attachment-button" title={text.attach}><PaperclipIcon/><span>{text.attach}</span><input type="file" accept={fileAccept} multiple onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }}/></label>
        <label className="sr-only" htmlFor="intake-message">{text.composerLabel}</label><textarea id="intake-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={activeQuestion ? text.answerPlaceholder : text.placeholder} rows={1} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void runAnalysis(draft); } }}/>
        <button type="submit" className="send-button" aria-label={text.send} disabled={busy || requiresReattach || (!draft.trim() && skipQuestionIds.length === 0 && files.length === 0 && !translationsDirty) || (skipQuestionIds.length > 0 && !skipAcknowledged) || (files.length > 0 && !mediaConsent)}><SendIcon/></button>
      </form>
      <div className="composer-notes"><span>{text.fileLimits}</span><span>{files.length}/10 · {formatSize(totalBytes)}</span></div>
    </div>
    <footer className="chat-intake__footer">{text.payment}</footer>
  </section>;
}
