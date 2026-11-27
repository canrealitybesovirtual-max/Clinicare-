/**
 * Shell wording in English and Spanish: header, navigation, menus, footer disclaimers, crisis help, privacy bar,
 * idle notices and error pages. Plain data (no React, no content imports), so client components and the root
 * error fallback can share it. `{slot}` placeholders are filled with `fill()` from ./core.
 *
 * Spanish 988 wording: the official page could not be opened from this build environment, so the app says
 * "ask for Spanish" (pida atención en español) instead of naming a menu option. Re-check on 988lifeline.org
 * with the other crisis entries before release (G9/G10).
 */
import type { Text } from "./core";

/** G14 disclaimer for clinician screens. The English sentence is fixed wording; tests check it. */
export const DISCLAIMER = {
  en: "Resource only. Not a substitute for clinical judgment. Not a medical device. For licensed clinicians.",
  es: "Solo es un recurso. No sustituye el juicio clínico. No es un dispositivo médico. Para profesionales clínicos con licencia.",
} satisfies Text;

/** G14 disclaimer for client screens (/client/**, /r/**): the positioning sentence plus a plain-language line. */
export const CLIENT_DISCLAIMER = {
  en: "Resource only. Not a substitute for clinical judgment. This page shares general information. It is not medical advice and does not replace care from a licensed professional.",
  es: "Solo es un recurso. No sustituye el juicio clínico. Esta página ofrece información general. No es consejo médico y no reemplaza la atención de un profesional con licencia.",
} satisfies Text;

export const NAV = {
  symptoms: { en: "Symptoms", es: "Síntomas" },
  diagnoses: { en: "Diagnoses", es: "Diagnósticos" },
  measures: { en: "Measures", es: "Escalas" },
  plan: { en: "Plan", es: "Plan" },
  interventions: { en: "Interventions", es: "Intervenciones" },
  handouts: { en: "Handouts", es: "Materiales" },
  referrals: { en: "Referrals", es: "Derivaciones" },
  medications: { en: "Medications", es: "Medicamentos" },
  ethics: { en: "Ethics & Legal", es: "Ética y legal" },
  tools: { en: "Tools", es: "Herramientas" },
  clientMode: { en: "Client mode", es: "Modo cliente" },
  about: { en: "About", es: "Acerca de" },
  clientHome: { en: "Home", es: "Inicio" },
  calm: { en: "Calm", es: "Calma" },
  skills: { en: "Skills", es: "Ejercicios" },
  findHelp: { en: "Find help", es: "Buscar ayuda" },
} satisfies Record<string, Text>;

export const HEADER = {
  skip: { en: "Skip to main content", es: "Saltar al contenido principal" },
  clientBrand: { en: "Self-help", es: "Autoayuda" },
  mainNav: { en: "Main", es: "Principal" },
  clientNav: { en: "Self-help", es: "Autoayuda" },
  more: { en: "More", es: "Más" },
  menu: { en: "Menu", es: "Menú" },
  currentPage: { en: ", current page: {page}", es: ", página actual: {page}" },
  closeMenu: { en: "Close menu", es: "Cerrar menú" },
  menuDescription: {
    en: "Clinician tools, client mode and about this app.",
    es: "Herramientas clínicas, modo cliente e información sobre esta aplicación.",
  },
  clinicianTools: { en: "Clinician tools", es: "Herramientas clínicas" },
  other: { en: "Other", es: "Otros" },
  /** Shows the language it switches to, written in that language. */
  switchLanguage: { en: "Español", es: "English" },
  switchLanguageHint: { en: "Ver esta pantalla en español", es: "View this screen in English" },
  largeText: { en: "Large text", es: "Texto grande" },
  largeTextHint: {
    en: "Larger text and spacing, for screen sharing and low vision",
    es: "Texto y espacios más grandes, para compartir pantalla y baja visión",
  },
  clinicianView: { en: "Clinician view", es: "Vista clínica" },
  clinicianViewTitle: { en: "Return to clinician view?", es: "¿Volver a la vista clínica?" },
  clinicianViewBody: {
    en: "Clinical notes from this session will be visible on this screen.",
    es: "Las notas clínicas de esta sesión se verán en esta pantalla.",
  },
  stayClient: { en: "Stay in client mode", es: "Quedarse en modo cliente" },
  returnClinician: { en: "Return to clinician view", es: "Volver a la vista clínica" },
} satisfies Record<string, Text>;

export const DIALOG = {
  close: { en: "Close", es: "Cerrar" },
  newTab: { en: " (opens in a new tab)", es: " (se abre en una pestaña nueva)" },
} satisfies Record<string, Text>;

export const CRISIS = {
  clinicianButton: { en: "Crisis help", es: "Ayuda en crisis" },
  clientButton: { en: "Get help now", es: "Ayuda ahora" },
  clinicianTitle: { en: "Crisis support", es: "Apoyo en crisis" },
  clientTitle: { en: "Get help now", es: "Ayuda ahora" },
  clinicianDescription: {
    en: "Numbers for the selected country. Use your clinical judgment and local protocol.",
    es: "Números del país seleccionado. Use su juicio clínico y el protocolo local.",
  },
  clientDescription: {
    en: "Free, confidential help is available any time.",
    es: "Hay ayuda gratuita y confidencial a cualquier hora.",
  },
  dangerClinician: {
    en: "If someone is in immediate danger, call {number} now.",
    es: "Si alguien está en peligro inmediato, llame ahora al {number}.",
  },
  dangerClient: {
    en: "If you or someone else is in danger right now, call {number}.",
    es: "Si usted u otra persona está en peligro ahora mismo, llame al {number}.",
  },
  dangerClinicianLocal: {
    en: "If someone is in immediate danger, call the local emergency number now.",
    es: "Si alguien está en peligro inmediato, llame ahora al número de emergencias local.",
  },
  dangerClientLocal: {
    en: "If you or someone else is in danger right now, call your local emergency number.",
    es: "Si usted u otra persona está en peligro ahora mismo, llame al número de emergencias local.",
  },
  call: { en: "Call {number}", es: "Llamar al {number}" },
  text: { en: "Text {number}", es: "Enviar texto al {number}" },
  callOrText: { en: "Call or text {number}", es: "Llamar o enviar texto al {number}" },
  emergency: { en: "Emergency {number}", es: "Emergencias {number}" },
  localEmergency: { en: "Local emergency number", es: "Número de emergencias local" },
  lineOf: { en: " ({country} crisis line)", es: " (línea de crisis de {country})" },
  country: { en: "Country", es: "País" },
  otherCountry: { en: "Another country", es: "Otro país" },
  lineHeading: { en: "Crisis line", es: "Línea de crisis" },
  lineHeadingClient: { en: "Talk to someone now", es: "Hable con alguien ahora" },
  website: { en: "Website:", es: "Sitio web:" },
  otherCountries: { en: "Other countries:", es: "Otros países:" },
  noLineClinician: {
    en: "Call the local emergency number. Use the directory below to find a crisis line in that country.",
    es: "Llame al número de emergencias local. Use el directorio de abajo para encontrar una línea de crisis en ese país.",
  },
  noLineClient: {
    en: "Call your local emergency number. To find a free helpline in your country, use the link below.",
    es: "Llame al número de emergencias local. Para encontrar una línea de ayuda gratuita en su país, use el enlace de abajo.",
  },
  /** US only: the 988 Lifeline answers in Spanish (see the file note on wording). */
  spanishUS: {
    en: "Spanish-language support: call or text 988 and ask for Spanish.",
    es: "Atención en español: llame o envíe un mensaje de texto al 988 y pida atención en español.",
  },
  unverified: {
    en: "Verify numbers locally before relying on them; this list has not yet been re-verified for release.",
    es: "Verifique los números localmente antes de confiar en ellos; esta lista aún no se ha vuelto a verificar para su publicación.",
  },
  confirmLocal: {
    en: "Confirm local numbers when you can; services sometimes change them.",
    es: "Confirme los números locales cuando pueda; los servicios a veces los cambian.",
  },
  noRisk: { en: "This app does not assess or decide risk.", es: "Esta aplicación no evalúa ni decide el riesgo." },
  clientNote: {
    en: "Phone numbers can change. Check your local number. This app cannot tell how safe you are; a person can help.",
    es: "Los números de teléfono pueden cambiar. Confirme su número local. Esta aplicación no puede saber qué tan a salvo está; una persona sí puede ayudarle.",
  },
} satisfies Record<string, Text>;

/** Names for the countries in content/crisis-lines.json. */
export const COUNTRY_NAMES = {
  US: { en: "United States", es: "Estados Unidos" },
  CA: { en: "Canada", es: "Canadá" },
  GB: { en: "United Kingdom", es: "Reino Unido" },
  IE: { en: "Ireland", es: "Irlanda" },
  AU: { en: "Australia", es: "Australia" },
  NZ: { en: "New Zealand", es: "Nueva Zelanda" },
} satisfies Record<string, Text>;

export const PRIVACY = {
  clinicianLead: { en: "Do not enter names or identifying details.", es: "No escriba nombres ni datos de identificación." },
  clinicianShort: { en: "Nothing is saved.", es: "No se guarda nada." },
  clinicianLong: {
    en: "Nothing is saved, and the session clears when you close the tab or after {minutes} minutes without activity.",
    es: "No se guarda nada, y la sesión se borra al cerrar la pestaña o tras {minutes} minutos sin actividad.",
  },
  clientLead: {
    en: "Please do not type your name or other personal details.",
    es: "Por favor, no escriba su nombre ni otros datos personales.",
  },
  clientShort: { en: "Nothing here is saved.", es: "Aquí no se guarda nada." },
  clientLong: {
    en: "Nothing here is saved, and it clears when you close the tab or after {minutes} minutes without activity.",
    es: "Aquí no se guarda nada, y se borra al cerrar la pestaña o tras {minutes} minutos sin actividad.",
  },
  clear: { en: "Clear session", es: "Borrar sesión" },
  /** Visible on phones; the accessible name stays the full `clear` label. */
  clearShort: { en: "Clear", es: "Borrar" },
  cleared: { en: "Session cleared. Nothing was saved.", es: "Sesión borrada. No se guardó nada." },
  idleWarning: {
    en: "For privacy, this session clears in {seconds} seconds.",
    es: "Por privacidad, esta sesión se borrará en {seconds} segundos.",
  },
  keepWorking: { en: "Keep working", es: "Seguir trabajando" },
  idleCleared: {
    en: "Your session was cleared after {minutes} minutes without activity. Nothing was saved.",
    es: "La sesión se borró tras {minutes} minutos sin actividad. No se guardó nada.",
  },
  dismiss: { en: "Dismiss notice", es: "Cerrar aviso" },
} satisfies Record<string, Text>;

export const FOOTER = {
  clinicianNote: {
    en: "Phase 1 reference build. Clinical wording is original, with named sources; items not yet reviewed by a licensed clinician are marked. Nothing you type is stored. Lookups send only a code, a curated term, a drug name, or a ZIP code or city, never what you typed about the client.",
    es: "Versión de referencia de la fase 1. La redacción clínica es original y cita sus fuentes; se marcan los elementos que aún no revisó un profesional clínico con licencia. Nada de lo que escribe se guarda. Las búsquedas solo envían un código, un término seleccionado, el nombre de un medicamento, o un código postal o una ciudad, nunca lo que escribió sobre el cliente.",
  },
  clientNote: { en: "Nothing you type here is saved.", es: "Nada de lo que escribe aquí se guarda." },
  crisisClinician: {
    en: "In crisis? In the US, call or text {line}. Elsewhere, call your local emergency number or visit {directory}.",
    es: "¿En crisis? En EE. UU., llame o envíe un mensaje de texto al {line} y pida atención en español. En otros países, llame al número de emergencias local o visite {directory}.",
  },
  crisisClient: {
    en: "Need help now? In the US, call or text {line}. Elsewhere, call your local emergency number or visit {directory}.",
    es: "¿Necesita ayuda ahora? En EE. UU., llame o envíe un mensaje de texto al {line} y pida atención en español. En otros países, llame al número de emergencias local o visite {directory}.",
  },
  about: { en: "About, privacy and licensing", es: "Acerca de, privacidad y licencias (en inglés)" },
  findHelp: { en: "Where to get help", es: "Dónde buscar ayuda" },
} satisfies Record<string, Text>;

export const ERRORS = {
  title: { en: "Something went wrong", es: "Algo salió mal" },
  body: {
    en: "This screen could not be shown. No details were recorded or sent. You can try again, or use the crisis button at any time.",
    es: "No se pudo mostrar esta pantalla. No se registró ni se envió ningún detalle. Puede intentarlo de nuevo o usar el botón de crisis en cualquier momento.",
  },
  appBody: {
    en: "The app could not load. No details were recorded or sent. Crisis help is below and does not depend on the app.",
    es: "La aplicación no pudo cargarse. No se registró ni se envió ningún detalle. La ayuda en crisis está abajo y no depende de la aplicación.",
  },
  needHelp: { en: "Need help now?", es: "¿Necesita ayuda ahora?" },
  usLine: {
    en: "In the US: call or text {line} (988 Suicide & Crisis Lifeline).",
    es: "En EE. UU.: llame o envíe un mensaje de texto al {line} (988 Suicide & Crisis Lifeline) y pida atención en español.",
  },
  danger: {
    en: "In immediate danger: call {number} or your local emergency number.",
    es: "En peligro inmediato: llame al {number} o al número de emergencias local.",
  },
  otherCountries: { en: "Other countries: {directory}.", es: "Otros países: {directory}." },
  retry: { en: "Try again", es: "Intentar de nuevo" },
  home: { en: "Go to home", es: "Ir al inicio" },
  notFoundTitle: { en: "This page does not exist", es: "Esta página no existe" },
  notFoundClinician: {
    en: "The link may be out of date. Nothing you typed was sent anywhere. Crisis help stays available from the button on every screen.",
    es: "Es posible que el enlace esté desactualizado. Nada de lo que escribió se envió a ningún lugar. La ayuda en crisis sigue disponible con el botón de cada pantalla.",
  },
  notFoundClient: {
    en: "The link may be out of date. Help is always available from the Get help now button.",
    es: "Es posible que el enlace esté desactualizado. Siempre puede pedir ayuda con el botón Ayuda ahora.",
  },
  symptomFinder: { en: "Symptom Finder", es: "Buscador de síntomas" },
  clientSelfHelp: { en: "Client self-help", es: "Autoayuda para clientes" },
  selfHelpHome: { en: "Self-help home", es: "Inicio de autoayuda" },
} satisfies Record<string, Text>;
