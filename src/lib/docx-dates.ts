/**
 * Word exports carry no dates (G5). The docx library always writes dcterms:created and dcterms:modified into
 * docProps/core.xml; once a clinician fills in the blank client line, that timestamp becomes a date of service
 * tied to a person. This removes both elements and re-zips the file, on this device. Pure.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const CORE = "docProps/core.xml";
const DATE_ELEMENTS = /<dcterms:(created|modified)\b[^>]*>[^<]*<\/dcterms:\1>/g;

export function withoutDocxDates(docx: Uint8Array): Uint8Array {
  const files = unzipSync(docx);
  const core = files[CORE];
  if (!core) return docx;
  files[CORE] = strToU8(strFromU8(core).replace(DATE_ELEMENTS, ""));
  return zipSync(files);
}
