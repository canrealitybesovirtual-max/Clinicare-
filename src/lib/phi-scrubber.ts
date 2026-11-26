/**
 * Client-side PHI scrubber for the 18 HIPAA Safe Harbor identifiers
 * (45 CFR 164.514(b)(2)). Runs in the browser BEFORE any other processing.
 *
 * Design rules
 * - Pure: no I/O, no logging, no globals mutated. Same input -> same output.
 * - Findings use indices into the ORIGINAL text; `clean` replaces each finding
 *   with `[TYPE]` (for example "[NAME]", "[DATE]").
 * - Idempotent: scrubbing `clean` again finds nothing new (placeholders are
 *   upper-case with no digits, so no detector matches them).
 * - Linear-ish: every regex is anchored on a cue or a bounded token; no nested
 *   unbounded quantifiers. E-mail is found by scanning "@" characters.
 * - Errs toward redaction for identifiers, but must leave ordinary clinical
 *   text alone: measure names and scores, ICD codes, durations, counts, ages
 *   0-89, ratings such as 8/10, bare years, medication names and doses,
 *   clinical abbreviations, weekdays, religious words, US states, countries.
 *
 * Safe Harbor coverage
 *  (A) names .................... NAME (cue words, title + name, common first
 *                                  names, First Last pairs, common surnames)
 *  (B) geography below state .... ADDRESS (street, PO Box, unit, county,
 *                                  "lives in <City>", "<City>, <State>"), ZIP
 *  (C) dates except year, ages
 *      over 89 .................. DATE, AGE_OVER_89
 *  (D) telephone ................ PHONE      (E) fax ......... FAX
 *  (F) e-mail ................... EMAIL      (G) SSN ......... SSN
 *  (H) medical record numbers ... MRN        (I) health plan . HEALTH_PLAN_ID
 *  (J) account numbers .......... ACCOUNT    (K) license/cert  LICENSE
 *  (L) vehicle ids / plates ..... VEHICLE    (M) devices ..... DEVICE
 *  (N) URLs (and @handles) ...... URL        (O) IP addresses  IP
 *  (P) biometric identifiers .... BIOMETRIC
 *  (Q) full-face photographs .... N/A: the app has no upload or image fields,
 *                                  so there is nothing to detect.
 *  (R) any other unique id ...... OTHER_ID (6+ digit tokens, mixed tokens with
 *                                  3+ digits, "#12345")
 *
 * This is a safety net, not a guarantee. The UI must still tell clinicians not
 * to enter identifiers.
 */
import type { PhiFinding, PhiType, ScrubResult } from "./types";

export const PHI_TYPE_LABELS: Record<PhiType, string> = {
  NAME: "Name",
  ADDRESS: "Address or location",
  ZIP: "ZIP code",
  DATE: "Date",
  AGE_OVER_89: "Age over 89",
  PHONE: "Phone number",
  FAX: "Fax number",
  EMAIL: "Email address",
  SSN: "Social Security number",
  MRN: "Medical record number",
  HEALTH_PLAN_ID: "Health plan or insurance ID",
  ACCOUNT: "Account or card number",
  LICENSE: "License or certificate number",
  VEHICLE: "Vehicle identifier or plate",
  DEVICE: "Device identifier or serial number",
  URL: "Web address or handle",
  IP: "IP address",
  BIOMETRIC: "Biometric identifier",
  OTHER_ID: "Other identifying number",
};

/** Overlap resolution: higher priority wins, then the longer span. */
const PRIORITY: Record<PhiType, number> = {
  EMAIL: 100,
  URL: 95,
  IP: 92,
  SSN: 90,
  MRN: 88,
  HEALTH_PLAN_ID: 88,
  ACCOUNT: 87,
  LICENSE: 86,
  VEHICLE: 86,
  DEVICE: 86,
  BIOMETRIC: 86,
  FAX: 85,
  PHONE: 80,
  DATE: 75,
  AGE_OVER_89: 74,
  ADDRESS: 70,
  ZIP: 65,
  NAME: 60,
  OTHER_ID: 10,
};

const words = (s: string): ReadonlySet<string> => new Set(s.split(/\s+/).filter(Boolean));

/* ------------------------------------------------------------------ */
/* Word lists                                                          */
/* ------------------------------------------------------------------ */

/** Common US given names that are rarely ordinary English words. Matched as capitalized tokens anywhere. */
const FIRST_NAMES = words(`
James John Robert Michael William David Richard Joseph Thomas Charles Christopher Daniel Matthew Anthony
Donald Steven Paul Andrew Joshua Kenneth Kevin Brian George Timothy Ronald Edward Jason Jeffrey Ryan Jacob
Gary Nicholas Eric Jonathan Stephen Larry Justin Scott Brandon Benjamin Samuel Gregory Alexander Patrick
Raymond Dennis Jerry Tyler Aaron Jose Adam Nathan Henry Douglas Zachary Peter Kyle Ethan Walter Noah Jeremy
Keith Roger Terry Austin Sean Gerald Carl Harold Dylan Arthur Lawrence Jesse Bryan Billy Bruce Gabriel Joe
Logan Alan Juan Albert Willie Elijah Randy Wayne Vincent Liam Roy Ralph Eugene Russell Bobby Mason Philip
Louis Harry Howard Johnny Carlos Luis Jimmy Antonio Danny Tony Shawn Travis Jeffery Todd Craig Derek Marcus
Victor Martin Curtis Luke Caleb Isaac Owen Wyatt Carter Julian Levi Isaiah Aiden Jackson Lucas Oliver Elias
Mateo Miguel Diego Jorge Pedro Manuel Javier Ricardo Francisco Alejandro Fernando Andre Darius Malik Jamal
Tyrone DeShawn Terrence Xavier Ahmed Omar Ali Hassan Raj Wei Hiroshi Kenji Dmitri Sergei Ivan Mikhail Hector
Rafael Ramon Sergio Eduardo Roberto Marco Mario Luca Giovanni Kai Ezra Asher Silas Theodore Theo Jaxon
Grayson Landon Brayden Connor Colton Hudson Cameron Evan Ian Nolan Blake Brody Trevor Derrick Marvin
Clarence Glenn Leonard Stanley Frederick Fred Gordon Herbert Lloyd Norman Randall Shane Troy Dustin Corey
Cody Brett Garrett Jared Spencer Tanner Jake Josh Matt Mike Steve Dave Tom Jim Tim Dan Ben Sam Nick Chris
Alex Greg Jeff Ken Ron Doug Andy Jon Kenny Tommy Ricky Mitch Zach Nate Lee
Mary Patricia Jennifer Linda Elizabeth Barbara Susan Jessica Sarah Karen Lisa Nancy Betty Sandra Margaret
Ashley Kimberly Emily Donna Michelle Amanda Melissa Deborah Stephanie Dorothy Rebecca Sharon Laura Cynthia
Amy Kathleen Angela Shirley Brenda Emma Anna Pamela Nicole Samantha Katherine Christine Debra Rachel
Carolyn Janet Maria Catherine Heather Diane Olivia Julie Joyce Victoria Ruth Lauren Kelly Christina Joan
Evelyn Judith Andrea Hannah Megan Cheryl Jacqueline Martha Madison Teresa Gloria Sara Janice Ann Kathryn
Abigail Sophia Frances Jean Alice Judy Isabella Julia Beverly Denise Marilyn Danielle Brittany Diana
Natalie Jane Lori Alexis Tiffany Kayla Ava Mia Charlotte Amelia Harper Ella Chloe Zoe Madeline Aubrey
Addison Leah Savannah Audrey Claire Lucy Stella Natalia Gabriella Valentina Camila Sofia Ximena Guadalupe
Rosa Carmen Lucia Elena Adriana Alejandra Veronica Yolanda Juanita Priya Aisha Fatima Mei Yuki Keisha
Latoya Tamika Shanice Jasmine Tanya Tonya Wendy Tina Tracy Stacy Kristen Kristin Erin Erica Monica Vanessa
Melanie Allison Courtney Lindsay Kelsey Morgan Taylor Paige Jenna Katie Kate Jenny Becky Cindy Debbie Peggy
Connie Marie Paula Sylvia Irene Lillian Helen Anne Ellen Eleanor Josephine Theresa Rita Norma Lois Phyllis
Doris Mildred Gladys Edna Esther Kathy Vicki Gina Lydia Naomi Miriam Leslie Jill Joanne Bethany Molly
Maggie Abby Ellie Nora Layla Riley Scarlett Penelope Sienna Gianna Maya Kylie Brianna Alyssa Jada Imani Nia
Zara Leila Yasmin Ana Isabel Daniela Paola Marisol Pilar Ingrid Greta Heidi Olga Svetlana Anya Natasha
Tatiana Nadia Mariam Noor Ling Jia Hana Sakura Ayesha Brooke Kim Renee Xochitl Saoirse Siobhan Niamh Aoife
Itzel Yesenia Maribel Araceli Esmeralda Rocio Consuelo Graciela Joaquin Ignacio Agustin Andres Ruben
Nicolas Sebastian Tomas Matias Martina Agustina Valeria Jimena Florencia Beatriz Ines Raul Oscar Cesar Hugo
`);

/**
 * Given names that are also everyday words, months, places or religious terms.
 * Only redacted when cued ("my wife Grace", "Dr. Will") or followed by a known surname.
 */
const AMBIGUOUS_NAMES = words(`
Will May June April Grace Hope Faith Joy Rose Mark Bill Pat Art Sue Rich Jack Chase Dawn Summer Hunter Max
Frank Bob Iris Ivy Guy Ray Earl Gene Major Bud Sandy Rusty Holly Penny Ruby Amber Crystal Sky Angel Lily
Daisy Violet Christian Jordan Chad Carol Robin Jay Hazel Destiny Ebony Aria Nova Luna Aurora Willow
Esperanza Eve August Drew Don Al Ed Jan Dakota Virginia Georgia Carolina India Montana Mohammed Muhammad
Jesus Trinity Genesis Autumn Harmony Melody Serenity Heaven Patience Charity Honor Justice King Prince Duke
Sterling Cash Dean Lane Reed Wade Bishop Pierce Price Miles Cliff Rocky Sunny Star Rain Storm River Brook
Kitty Misty Stormy Bonnie Ginger Olive Sage Basil Pearl Jade Opal Coral
`);

/** Common US surnames that are not everyday words. Matched alone as capitalized tokens. */
const DISTINCTIVE_SURNAMES = words(`
Smith Johnson Williams Jones Garcia Miller Davis Rodriguez Martinez Hernandez Lopez Gonzalez Wilson Anderson
Thompson Harris Sanchez Ramirez Lewis Robinson Allen Torres Nguyen Flores Adams Nelson Rivera Campbell
Mitchell Roberts Gomez Phillips Evans Diaz Edwards Collins Reyes Stewart Morris Morales Murphy Gutierrez
Ortiz Peterson Bailey Richardson Watson Chavez Bennett Mendoza Ruiz Hughes Alvarez Castillo Sanders Patel
Myers Foster Jimenez Powell Jenkins Perry Sullivan Coleman Henderson Barnes Gonzales Vasquez Simmons Romero
Patterson Griffin Wallace Moreno Bryant Herrera Gibson Tran Medina Aguilar Stevens Murray Castro Owens
Harrison Fernandez McDonald Kennedy Vargas Chen Freeman Webb Tucker Guzman Crawford Olson Simpson Mendez
Silva Snyder Dixon Munoz Hicks Holmes Palmer Wagner Robertson Boyd Salazar Warren Meyer Schmidt Garza
Daniels Ferguson Nichols Stephens Soto Payne Dunn Kelley Hawkins Arnold Vazquez Hansen Peters Santos Bradley
Elliott Cunningham Duncan Carroll Andrews Alvarado Delgado Perkins Hoffman Johnston Matthews Pena Richards
Contreras Willis Sandoval Wang Zhang Liu Singh Kumar Khan Cohen Goldberg Schwartz Kowalski Nowak Ivanov
Yamamoto Tanaka Suzuki Sato Choi Pham Hoang
`);

/**
 * Surnames that are also common words or famous clinical theorists (Clark's panic
 * model, Ellis, Rogers, Hayes, the Hamilton scales). Only redacted after a first name.
 */
const PAIR_ONLY_SURNAMES = words(`
Brown White Walker Young King Wright Scott Hill Green Baker Hall Turner Parker Cruz Cook Rogers Morgan
Cooper Reed Kelly Howard Ramos Kim Cox Ward Brooks Wood James Gray Price Long Ross Russell Bell Butler
Fisher Jordan Alexander Hamilton Graham Reynolds West Cole Hayes Ellis Ford Marshall Woods Washington
Wells Henry Burns Porter Hunter Gordon Shaw Mason Hunt Black Rose Stone Fox Mills Rice Weaver Ryan Gardner
Grant Spencer Pierce Hart Knight Armstrong Hudson Lane Riley Ray Berry Lawrence Carpenter Clark Thomas
Taylor Moore Jackson Martin Lee Carter Li Ali Park Jacobson Beck Barlow Foa Shapiro Linehan Freud Jung
`);

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida",
  "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
  "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska",
  "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas",
  "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "District of Columbia",
  "Puerto Rico", "Guam",
];
const STATE_CODES =
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR GU VI";

const COUNTRIES = [
  "United States", "America", "Canada", "Mexico", "Brazil", "Argentina", "Colombia", "Peru", "Chile",
  "Venezuela", "Cuba", "Haiti", "Jamaica", "Dominican Republic", "Guatemala", "Honduras", "El Salvador",
  "Nicaragua", "Costa Rica", "Panama", "Ecuador", "Bolivia", "Paraguay", "Uruguay", "England", "Scotland",
  "Wales", "Ireland", "Britain", "Great Britain", "United Kingdom", "France", "Germany", "Italy", "Spain",
  "Portugal", "Netherlands", "Holland", "Belgium", "Switzerland", "Austria", "Sweden", "Norway", "Denmark",
  "Finland", "Iceland", "Poland", "Ukraine", "Russia", "Greece", "Turkey", "Romania", "Hungary", "Czechia",
  "Serbia", "Croatia", "Bosnia", "Albania", "Bulgaria", "Israel", "Palestine", "Lebanon", "Syria", "Iraq",
  "Iran", "Afghanistan", "Pakistan", "India", "Bangladesh", "Nepal", "Sri Lanka", "China", "Japan", "Korea",
  "South Korea", "North Korea", "Vietnam", "Thailand", "Cambodia", "Laos", "Myanmar", "Burma", "Philippines",
  "Indonesia", "Malaysia", "Singapore", "Taiwan", "Mongolia", "Australia", "New Zealand", "Egypt", "Libya",
  "Tunisia", "Algeria", "Morocco", "Sudan", "South Sudan", "Ethiopia", "Eritrea", "Somalia", "Kenya", "Uganda",
  "Tanzania", "Rwanda", "Congo", "Nigeria", "Ghana", "Senegal", "Liberia", "Sierra Leone", "Cameroon",
  "Angola", "Zimbabwe", "Zambia", "Mozambique", "South Africa", "Saudi Arabia", "Yemen", "Oman", "Qatar",
  "Kuwait", "Jordan", "Chad", "Mali", "Niger", "Africa", "Europe", "Asia", "Latin America", "Central America",
  "South America", "Caribbean", "Middle East",
];

/** Places that are never redacted (states and countries are not Safe Harbor identifiers). */
const GEO_ALLOWED: ReadonlySet<string> = new Set([...US_STATES, ...COUNTRIES]);
/** Single tokens that belong to an allowed place name ("New", "York", "Carolina"...). */
const GEO_TOKENS: ReadonlySet<string> = new Set([...GEO_ALLOWED].flatMap((p) => p.split(" ")));

/**
 * Capitalized words that must never be read as a name or city after a cue word,
 * nor as the second half of a First Last pair.
 */
const NON_NAME_WORDS = words(`
January February March April May June July August September October November December
Jan Feb Mar Apr Jun Jul Aug Sep Sept Oct Nov Dec
Monday Tuesday Wednesday Thursday Friday Saturday Sunday Mon Tue Tues Wed Thu Thur Thurs Fri Sat Sun
Today Tonight Yesterday Tomorrow Morning Afternoon Evening Night Weekend Week Month Year Day Daily Weekly
God Lord Allah Jesus Christ Bible Quran Koran Torah Talmud Buddha Krishna Holy Spirit Ghost Church Mosque
Temple Synagogue Scripture Scriptures Psalm Psalms Gospel Heaven Hell Satan Devil Christians Muslim
Muslims Jewish Jew Hindu Buddhist Catholic Protestant Baptist Methodist Mormon Sikh Islam Christianity
Judaism Prayer Pastor Priest Rabbi Imam Saint
Christmas Thanksgiving Easter Ramadan Eid Hanukkah Passover Diwali Halloween Kwanzaa Lent Yom Kippur
The A An And Or But So If Then Than There Here When Where While After Before Since During Until Because
Although However Also Both All Any Some None Each Every Other Another Such No Not Yes Very Just Only Even
He She They We I It You His Her Hers Their Theirs Our Ours My Mine Your This That These Those Who What Which
Him Them Me Us Its Is Are Was Were Be Been Has Have Had Do Does Did Can Could Would Should Must Might Shall
Mom Dad Mother Father Mommy Daddy Mama Papa Ma Pa Sister Brother Son Daughter Wife Husband Partner Spouse
Grandma Grandpa Grandmother Grandfather Aunt Uncle Cousin Baby Child Kids Family Parents Friend Friends Boss
Client Clients Patient Patients Pt Doctor Doc Therapist Counselor Psychiatrist Psychologist Nurse Provider
Clinician Social Worker Case Manager Officer Police Judge Court Teacher School College University Work Job
Reports Reported Reporting Report Denies Denied Endorses Endorsed States Stated Says Said Feels Felt Notes
Noted Presents Presented Describes Described Appears Appeared Shows Showed Became Becomes Started Starts
Per Re Session Sessions Intake Assessment Diagnosis Diagnoses Treatment Therapy Plan Goal Goals Objective
Intervention Interventions Homework Handout Measure Measures Score Scores Scale Scales Inventory Checklist
Questionnaire Screener Screening Rating Index Interview Survey Test Total Item Items Severity Symptom Symptoms
Panic Anxiety Anxious Depression Depressive Depressed Disorder Disorders Major Minor Generalized Social
Specific Persistent Acute Chronic Severe Moderate Mild Stress Stressor Trauma Traumatic Posttraumatic Phobia
Agoraphobia Obsessive Compulsive Bipolar Mood Mental Health Behavioral Medical Clinical Primary Care Insurance
Emergency Room Department Hospital Clinic Center Centre Services Service Program Unit Ward Crisis Line
Lifeline Hotline Text Call Calls Chat Safety Suicide Suicidal Self Harm Risk Sleep Insomnia Alcohol Cannabis
Marijuana Nicotine Opioid Opioids Caffeine Substance Use Medication Medications Meds Dose Doses Pill Pills
Xanax Zoloft Prozac Lexapro Paxil Celexa Effexor Cymbalta Wellbutrin Remeron Trazodone Buspar Buspirone
Ativan Klonopin Valium Ambien Lunesta Seroquel Abilify Risperdal Zyprexa Latuda Lamictal Lithium Depakote
Adderall Ritalin Vyvanse Concerta Strattera Suboxone Subutex Vivitrol Narcan Naloxone Methadone Antabuse
Chantix Lyrica Neurontin Gabapentin Hydroxyzine Vistaril Propranolol Prazosin Sertraline Fluoxetine
Escitalopram Citalopram Paroxetine Venlafaxine Duloxetine Bupropion Mirtazapine Quetiapine Aripiprazole
Spravato Auvelity Trintellix Viibryd Rexulti Caplyta Vraylar Ozempic Tylenol Advil Benadryl Melatonin
Pristiq Fetzima Emsam Nardil Parnate Anafranil Tofranil Elavil Pamelor Sinequan Luvox Geodon Invega Haldol
Clozaril Saphris Fanapt Topamax Tegretol Trileptal Restoril Halcion Sonata Belsomra Rozerem Silenor Intuniv
Kapvay Focalin Qelbree Provigil Nuvigil Campral Revia Sublocade Lucemyra Zubsolv Brixadi Ingrezza Austedo
Cogentin Inderal Minipress Catapres Tenex Desyrel Symbyax Zurzuvae Zulresso Lybalvi Cobenfy Nexium Prilosec
Cognitive Behavioral Dialectical Exposure Acceptance Commitment Mindfulness Motivational Progressive Muscle
Relaxation Breathing Grounding Journal Journaling Worksheet Worry Thought Record Ladder Hierarchy
Generalised English Spanish French Chinese Arabic Hindi Korean Japanese Vietnamese Russian Portuguese German
American Mexican African Asian Hispanic Latino Latina Latinx Black White Native Indigenous Caucasian
North South East West Northern Southern Eastern Western Central Downtown Midwest
New Old Big Little Great Good Bad Best Worst First Second Third Last Next Few Many Much More Most Less Least
OK Okay Hi Hello Thanks Thank Please Sorry Dear Note Notes Summary History Background Impression Recommendation
Medicare Medicaid Tricare Aetna Cigna Humana Kaiser Anthem BlueCross VA Veterans Army Navy Marines Air Force
Facebook Instagram Twitter TikTok Snapchat YouTube Google Zoom Teams Apple Amazon Uber Lyft Walmart Target
Street Avenue Road Boulevard Lane Drive Court County City Town Village State Country
Mr Mrs Ms Mx Dr Prof Rev Fr Sr Jr Sra Srta Miss Mister Madam Sir
`);

/** Words after "Virgin", "Hail", "Saint" etc. are religious references, not people. */
const RELIGIOUS_PREFIX = /(?:Virgin|Hail|Saint|St\.?|Holy|Blessed|Book of|Gospel of|Prophet|Apostle)\s+$/;
/** Scripture references such as "John 3:16" or "Isaiah 41:10". */
const SCRIPTURE_REF = /\s*\d{1,3}:\d{1,3}|\s+(?:chapter|ch\.)\s*\d/y;

/** Suffixes that mark ordinary English words ("Centered", "Feeling", "Persistent"). */
const WORDLIKE_SUFFIX = /(?:ing|ed|tion|sion|ment|ness|ive|ous|ful|ity|able|ible|ism|ist|ogy|ance|ence|ical|ally|less|ship|ward|wise|ize|ise)$/;

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

interface Candidate {
  type: PhiType;
  start: number;
  end: number;
  priority: number;
}
/** `bonus` raises priority, e.g. for values that follow an explicit cue word ("IMEI 4901..."). */
type Add = (type: PhiType, start: number, end: number, bonus?: number) => void;
/** Cue-backed identifiers outrank bare-format matches (a 15-digit IMEI is DEVICE, not a card number). */
const CUED_BONUS = 10;

/** Run a sticky (y) regex at `pos`. */
function at(text: string, re: RegExp, pos: number): RegExpExecArray | null {
  re.lastIndex = pos;
  return re.exec(text);
}

/** Iterate all matches of a global regex (resets lastIndex; safe for shared module-level regexes). */
function each(text: string, re: RegExp, fn: (m: RegExpExecArray) => void): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    fn(m);
  }
}

const capitalize = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);
const digitCount = (s: string): number => s.replace(/\D/g, "").length;
/** O'Brien, McCarthy, MacArthur: surname shapes, trusted after a given name ("Saoirse O'Brien"). */
const SURNAME_SHAPE = /^(?:O['’]\p{Lu}\p{Ll}+|Mc\p{Lu}\p{Ll}+|Mac\p{Lu}\p{Ll}{3,})$/u;
const NOT_SURNAME_SHAPE = words("MacBook MacOS");
const distinctiveSurname = (t: string): boolean =>
  DISTINCTIVE_SURNAMES.has(t) || (SURNAME_SHAPE.test(t) && !NOT_SURNAME_SHAPE.has(t));
const isSurname = (t: string): boolean => distinctiveSurname(t) || PAIR_ONLY_SURNAMES.has(t);
const wordLike = (t: string): boolean => WORDLIKE_SUFFIX.test(t.toLowerCase());

/* ------------------------------------------------------------------ */
/* NAME                                                                 */
/* ------------------------------------------------------------------ */

const NAME_TOKEN_SRC = "(?:\\p{Lu}['’])?\\p{Lu}\\p{Ll}+(?:\\p{Lu}\\p{Ll}+)?(?:-\\p{Lu}\\p{Ll}+)?";
const NAME_TOKEN_G = new RegExp(`(?<![\\p{L}\\p{N}'’-])${NAME_TOKEN_SRC}(?![\\p{L}\\p{N}])`, "gu");
const NAME_TOKEN_Y = new RegExp(`${NAME_TOKEN_SRC}(?![\\p{L}\\p{N}])`, "yu");
const LOWER_TOKEN_Y = /\p{Ll}+(?![\p{L}\p{N}])/yu;
/** Same-line gap between name parts, with an optional middle initial ("John Q. Public"). */
const GAP_Y = /[ \t]+(?:[A-Z]\.[ \t]+)?/y;

const RELATION_WORDS = [
  "wife", "husband", "spouse", "partner", "fianc[eé]e?", "boyfriend", "girlfriend", "ex-wife", "ex-husband",
  "ex-partner", "ex", "son", "daughter", "stepson", "stepdaughter", "child", "kid", "baby", "mother", "father",
  "mom", "mum", "dad", "stepmom", "stepdad", "stepmother", "stepfather", "brother", "sister", "sibling", "twin",
  "cousin", "aunt", "uncle", "niece", "nephew", "grandmother", "grandfather", "grandma", "grandpa", "grandson",
  "granddaughter", "grandchild", "in-law", "boss", "supervisor", "manager", "coworker", "co-worker",
  "colleague", "friend", "roommate", "neighbou?r", "teacher", "coach", "pastor", "priest", "rabbi", "imam",
  "sponsor", "caseworker", "therapist", "psychiatrist", "counsell?or", "doctor", "nurse", "PCP", "attorney",
  "lawyer", "officer",
].join("|");

/** Each cue ends exactly where a name would start. */
const NAME_CUES: readonly RegExp[] = [
  /\b(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Rev|Fr|Sr|Sra|Srta)\b\.?[ \t]+/g,
  /\b(?:my name is|name is|named|called|calls (?:him|her|them)sel(?:f|ves)|goes by|known as|nicknamed|a\.k\.a\.?|aka)[ \t]+/gi,
  /\b(?:client|patient|pt|resident|consumer|veteran|member)\b\.?[ \t]*[:,]?[ \t]+/gi,
  new RegExp(`\\b(?:${RELATION_WORDS})\\b[ \\t]*,?[ \\t]+`, "gi"),
];

function religiousContext(text: string, start: number, end: number): boolean {
  return RELIGIOUS_PREFIX.test(text.slice(Math.max(0, start - 12), start)) || at(text, SCRIPTURE_REF, end) !== null;
}

/** May `tok` be a name when a cue word says a name follows? */
function cuedNameOk(tok: string, text: string, end: number): boolean {
  if (FIRST_NAMES.has(tok) || isSurname(tok)) return true;
  if (AMBIGUOUS_NAMES.has(tok)) return !/^[ \t]*\d/.test(text.slice(end, end + 4)); // "May 3" is a date
  if (NON_NAME_WORDS.has(tok) || GEO_TOKENS.has(tok)) return false;
  return !wordLike(tok);
}

/** May `tok` be the second (or third) part of a name? */
function laterNamePartOk(tok: string): boolean {
  if (isSurname(tok) || FIRST_NAMES.has(tok)) return true;
  if (NON_NAME_WORDS.has(tok) || GEO_TOKENS.has(tok) || AMBIGUOUS_NAMES.has(tok)) return false;
  return !wordLike(tok);
}

/** End of the following name parts after `end` (up to `max` more tokens). */
function extendName(text: string, end: number, max: number): number {
  for (let k = 0; k < max; k++) {
    const gap = at(text, GAP_Y, end);
    if (!gap) break;
    const p = end + gap[0].length;
    const n = at(text, NAME_TOKEN_Y, p);
    if (!n || !laterNamePartOk(n[0]) || religiousContext(text, p, p + n[0].length)) break;
    end = p + n[0].length;
  }
  return end;
}

/** Reads a name that starts exactly at `pos` (right after a cue). Returns end index, or -1. */
function readCuedName(text: string, pos: number): number {
  const m = at(text, NAME_TOKEN_Y, pos);
  if (!m) {
    // Lower-case typing: "my wife sarah". Only unambiguous given names.
    const lw = at(text, LOWER_TOKEN_Y, pos);
    return lw && FIRST_NAMES.has(capitalize(lw[0])) ? pos + lw[0].length : -1;
  }
  const end = pos + m[0].length;
  if (!cuedNameOk(m[0], text, end) || religiousContext(text, pos, end)) return -1;
  return extendName(text, end, 2);
}

/**
 * Eponyms, named scales, holidays and named events are not people: "Addison's disease", "Stevens
 * Johnson syndrome", "Taylor Manifest Anxiety Scale", "Martin Luther King Day", "Holmes and Rahe",
 * "Dr. Beck's cognitive model", "Hurricane Maria", "Mason jar".
 */
const EPONYM_AFTER_RE =
  /^(?:['’]s?[ \t]+(?:\p{Ll}+[ \t]+){0,2}(?:disease|syndrome|wort|palsy|disorder|phenomenon|sign|law|model|theory|triad|scale|inventory|questionnaire|method|technique|approach|protocol|paradox|effect|hierarchy|stages|curve|test)\b|(?:[ \t]+\p{Lu}\p{Ll}+){0,3}[ \t]+(?:Syndrome|Disease|Scale|Inventory|Questionnaire|Index|Test|Model|Method|Technique|Protocol|Palsy|Day)\b|(?:[ \t]+\p{Lu}\p{Ll}+){0,2}[ \t]+(?:syndrome|disease|palsy|jars?)\b|[ \t]+and[ \t]+Rahe\b)/u;
const EPONYM_BEFORE_RE = /(?:Hurricane|Tropical[ \t]+Storm|Storm|Typhoon|Cyclone)[ \t]+$/;
/** Street names for drugs ("took Molly"). Only after a use verb. */
const SLANG_NAMES = words("Molly Tina Charlie");
const SLANG_BEFORE_RE = /(?:took|take|takes|taking|on|using|uses|used|did|doing|popped|pops|tried|snorted|smoked|some|rolling[ \t]+on)[ \t]+$/i;

function notAPerson(text: string, start: number, end: number): boolean {
  if (EPONYM_AFTER_RE.test(text.slice(end, end + 60))) return true;
  const before = text.slice(Math.max(0, start - 24), start);
  if (EPONYM_BEFORE_RE.test(before)) return true;
  const first = text.slice(start, end).split(/[ \t]/)[0] ?? "";
  return SLANG_NAMES.has(first) && SLANG_BEFORE_RE.test(before);
}

/** Ambiguous given names ("Grace", "Bob") count as names right before a reporting or action verb. */
const NAME_VERB_AFTER_RE =
  /^[ \t]+(?:reports|reported|says|said|states|stated|denies|denied|endorses|endorsed|describes|described|admits|admitted|complains|complained|told|tells|hit|hits|punched|slapped|kicked|yelled|screamed|threatened|texted|cheated)\b/;
const NOT_NAME_BEFORE_RE = /(?:^|[^A-Za-z])(?:in|on|since|by|until|last|next|of|this|early|late|mid)[ \t]+$/i;
const LOWER_WORD_G = /(?<![\p{L}\p{N}'’-])\p{Ll}+(?![\p{L}\p{N}])/gu;
const INITIALS_RE = /(?<![A-Za-z])initials?[ \t]*(?:are|is|=|:|-)?[ \t]*([A-Z]\.?[ \t]?[A-Z](?:\.?[ \t]?[A-Z])?\.?)(?![A-Za-z])/g;

function detectNames(text: string, rawAdd: Add): void {
  const add: Add = (type, start, end, bonus) => {
    if (type !== "NAME" || !notAPerson(text, start, end)) rawAdd(type, start, end, bonus);
  };
  for (const cue of NAME_CUES) {
    each(text, cue, (m) => {
      const pos = m.index + m[0].length;
      const end = readCuedName(text, pos);
      if (end > pos) add("NAME", pos, end);
    });
  }
  each(text, INITIALS_RE, (m) => {
    const end = m.index + m[0].length;
    add("NAME", end - m[1]!.length, end);
  });

  const toks: { s: number; e: number; t: string }[] = [];
  each(text, NAME_TOKEN_G, (m) => toks.push({ s: m.index, e: m.index + m[0].length, t: m[0] }));

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (religiousContext(text, t.s, t.e)) continue;
    const nxt = toks[i + 1];
    const gap = at(text, GAP_Y, t.e);
    const adjacent = nxt !== undefined && gap !== null && t.e + gap[0].length === nxt.s;

    if (FIRST_NAMES.has(t.t) || (t.t.includes("-") && t.t.split("-").some((part) => FIRST_NAMES.has(part)))) {
      add("NAME", t.s, extendName(text, t.e, 2));
      continue;
    }
    // "Xiomara Rodriguez" (unknown word + distinctive surname) and "Grace Brown" (ambiguous name + any
    // listed surname) are pairs; "Uses Clark's model" (verb + theorist/word-like surname) is not.
    if (
      adjacent &&
      (distinctiveSurname(nxt.t) || (AMBIGUOUS_NAMES.has(t.t) && PAIR_ONLY_SURNAMES.has(nxt.t))) &&
      !NON_NAME_WORDS.has(t.t) &&
      !GEO_TOKENS.has(t.t) &&
      !wordLike(t.t) &&
      !religiousContext(text, nxt.s, nxt.e)
    ) {
      add("NAME", t.s, nxt.e);
      i++;
      continue;
    }
    // Alone, only listed surnames: O'/Mc shapes are also city names ("O'Fallon", "McKinney").
    if (DISTINCTIVE_SURNAMES.has(t.t)) {
      add("NAME", t.s, t.e);
      continue;
    }
    if (
      AMBIGUOUS_NAMES.has(t.t) &&
      NAME_VERB_AFTER_RE.test(text.slice(t.e, t.e + 16)) &&
      !NOT_NAME_BEFORE_RE.test(text.slice(Math.max(0, t.s - 10), t.s))
    ) {
      add("NAME", t.s, t.e);
    }
  }

  // Lower-case typing: "john smith" (listed given name + distinctive surname).
  const low: { s: number; e: number; t: string }[] = [];
  each(text, LOWER_WORD_G, (m) => low.push({ s: m.index, e: m.index + m[0].length, t: m[0] }));
  for (let i = 0; i + 1 < low.length; i++) {
    const a = low[i]!;
    const b = low[i + 1]!;
    if (!/^[ \t]+$/.test(text.slice(a.e, b.s))) continue;
    if (FIRST_NAMES.has(capitalize(a.t)) && DISTINCTIVE_SURNAMES.has(capitalize(b.t))) add("NAME", a.s, b.e);
  }

  // ALL-CAPS typing ("JOHN SMITH"). 4+ letters and listed names only, so acronyms (PTSD, SNRI, CAPS) are safe.
  each(text, ALLCAPS_TOKEN_RE, (m) => {
    const t = capitalize(m[0].toLowerCase());
    if (FIRST_NAMES.has(t) || DISTINCTIVE_SURNAMES.has(t)) add("NAME", m.index, m.index + m[0].length);
  });
}
const ALLCAPS_TOKEN_RE = /(?<![A-Za-z0-9'\u2019-])[A-Z]{4,}(?![A-Za-z0-9])/g;

/* ------------------------------------------------------------------ */
/* ADDRESS and ZIP                                                      */
/* ------------------------------------------------------------------ */

const STREET_SUFFIX =
  "Street|St|Avenue|Ave|Av|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Way|Place|Pl|Parkway|Pkwy|" +
  "Highway|Hwy|Terrace|Ter|Trail|Trl|Square|Sq|Loop|Route|Rte|Pike|Alley|Plaza|Plz|Crescent|Close|Freeway|Fwy|" +
  "Expressway|Expy|Turnpike|Tpke|Row";
const UNIT_WORD = "(?:Apt|APT|apt|Apartment|apartment|Unit|UNIT|Suite|Ste|STE|Bldg|Building|Rm|Room|Fl|Floor|Lot)";
const UNIT_VALUE = "(?:\\d[A-Za-z0-9-]{0,5}|[A-Za-z]\\d[A-Za-z0-9-]{0,4}|[A-Za-z](?![A-Za-z]))";

const STREET_RE = new RegExp(
  "\\b\\d{1,6}[A-Za-z]?(?:-\\d{1,4})?(?:[ \\t]+(?:N[EW]|S[EW]|[NSEW]|North|South|East|West)\\.?)?" +
    "(?:[ \\t]+(?:[A-Z][A-Za-z'.-]*|\\d{1,3}(?:st|nd|rd|th))){1,4}?" +
    // A trailing "." is left in place: it may end the sentence.
    `[ \\t]+(?:${STREET_SUFFIX})\\b` +
    "(?:\\.?[ \\t]+(?:N[EW]|S[EW]|[NSEW])\\b)?" +
    `(?:\\.?,?[ \\t]*(?:${UNIT_WORD}\\.?|#)[ \\t]*#?[ \\t]*${UNIT_VALUE})?`,
  "g",
);
const PO_BOX_RE = /\b(?:P\.?[ \t]?O\.?|Post[ \t]+Office)[ \t]*Box[ \t]+\d{1,8}\b/gi;
const UNIT_RE = new RegExp(`(?<![A-Za-z])${UNIT_WORD}\\.?[ \\t]*#?[ \\t]*${UNIT_VALUE}`, "g");
const COUNTY_RE = /(?<!\p{L})(?:\p{Lu}\p{Ll}+[ \t]+){1,3}(?:County|Parish|Borough|Township)\b/gu;

const LOCATION_CUE_RE =
  /\b(?:(?:lives?|living|lived|resides?|residing|resided|moved|moves|moving|relocated|relocating|relocate|stays|staying|stayed|grew[ \t]+up|raised|born|originally)[ \t]+(?:in|at|to|from|near|outside(?:[ \t]+of)?|back[ \t]+to)|is[ \t]+from|comes[ \t]+from|came[ \t]+from|hometown(?:[ \t]+is|[ \t]+of)?)[ \t]+(?:the[ \t]+)?/gi;
const BARE_FROM_RE = /\bfrom[ \t]+/gi;

/** Tokens allowed inside a city name even though they are listed as non-name words. */
const PLACE_WORDS = words(
  "New North South East West Old Fort Port Mount Mt Saint St San Santa Los Las El La Lake Grand Little Upper " +
    "Lower Glen Palm Point Cape Bay Falls Beach Park Springs City Heights Valley Rock Hills Haven Beach Village " +
    "Town Center Island",
);
const PLACE_TOKEN_Y = /(?:St\.|Mt\.|\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)?)(?![\p{L}\p{N}])/yu;

/** Reads a capitalized place name (1-4 tokens) at `pos`; -1 if none or if it is a state/country. */
function readPlace(text: string, pos: number, strict: boolean): number {
  let end = pos;
  const parts: string[] = [];
  for (let k = 0; k < 4; k++) {
    let p = end;
    if (k > 0) {
      const gap = at(text, /[ \t]+/y, end);
      if (!gap) break;
      p = end + gap[0].length;
    }
    const m = at(text, PLACE_TOKEN_Y, p);
    if (!m) break;
    const tok = m[0];
    const blocked = NON_NAME_WORDS.has(tok) && !PLACE_WORDS.has(tok) && !tok.endsWith(".");
    // "Austin Texas": stop before a state/country word so the state itself is never redacted.
    if (blocked || (k > 0 && (wordLike(tok) || (GEO_TOKENS.has(tok) && !PLACE_WORDS.has(tok))))) break;
    if (k === 0 && strict && (FIRST_NAMES.has(tok) || AMBIGUOUS_NAMES.has(tok) || isSurname(tok) || wordLike(tok))) {
      return -1;
    }
    parts.push(tok);
    end = p + tok.length;
  }
  if (parts.length === 0) return -1;
  const place = parts.join(" ");
  if (GEO_ALLOWED.has(place) || parts.every((t) => PLACE_WORDS.has(t))) return -1;
  if (parts.length === 1 && GEO_TOKENS.has(place)) return -1; // "Carolina", "Jersey"
  return end;
}

const STATE_CODE_ALT = STATE_CODES.split(" ").join("|");
const STATE_NAME_ALT = US_STATES.join("|");
/** State codes that are also English words: only trusted before a ZIP or at the end of a clause. */
const WORDLIKE_STATE_CODES = "OK|OR|IN|ME|HI|OH|DE|LA|MA|PA|AL|CO|ID|MS";
const PLAIN_STATE_CODES = STATE_CODES.split(" ")
  .filter((c) => !WORDLIKE_STATE_CODES.split("|").includes(c))
  .join("|");
const CITY_STATE_RE = new RegExp(
  `(?<!\\p{L})((?:(?:St\\.|\\p{Lu}\\p{Ll}+)[ \\t]+){0,2}(?:St\\.|\\p{Lu}\\p{Ll}+)),[ \\t]*` +
    `(?:(?:${STATE_NAME_ALT})(?![A-Za-z])|(?:${PLAIN_STATE_CODES})(?![A-Za-z])|(?:${WORDLIKE_STATE_CODES})(?=[ \\t]+\\d{5}|[ \\t]*(?:$|[.;)\\n])))`,
  "gmu",
);
/** "Dayton OH 45402": city, state code and ZIP without a comma. */
const CITY_STATE_ZIP_RE = new RegExp(
  `(?<!\\p{L})((?:\\p{Lu}\\p{Ll}+[ \\t]+){0,2}\\p{Lu}\\p{Ll}+)[ \\t]+(?:${STATE_CODE_ALT})[ \\t]+\\d{5}(?:-\\d{4})?(?!\\d)`,
  "gu",
);
/** "123 main street": a lower-case street line (number + 1-3 words + street suffix). */
const LOWER_STREET_RE = new RegExp(
  `\\b\\d{1,6}[a-z]?((?:[ \\t]+[a-z][a-z'.-]*){1,3}?)[ \\t]+(?:${STREET_SUFFIX.toLowerCase()})\\b`,
  "g",
);
/** Words that make "<number> ... road/way/drive" a distance or count, not a street line. */
const NOT_STREET_WORDS = words(`
the a an of in on at to for by with from down up across along around over under near past through into onto
out off back front side end more few many other times time steps step miles mile blocks block minutes minute
mins hours hour days day weeks week months month years year feet foot yards km kms meters laps pills mg people
things thing ways kids cars houses doors my her his their our your its this that and or but is was are were
be am not no so very just really long short big small good bad first last next same different whole half
`);
/** Single lower-case words after a location cue that are states of life, not places ("lives in fear"). */
const NOT_LOWER_PLACE = words(`
fear denial poverty pain shame terror dread isolation silence peace chaos squalor hell limbo constant shelter
shelters apartment apartments house houses home homes car cars motel hotel basement tent van town city country
area state community group foster care recovery rehab treatment jail prison sober halfway assisted nursing
public housing section dorm dorms campus barracks base rural urban suburbs suburb debt survival crisis
transition between unit ward hospital residential there here which what with her his their my our your an a
the one two three several many few mother father mom dad parents family grandmother grandparents aunt uncle
sister brother friend friends boyfriend girlfriend husband wife partner son daughter kids children roommate
roommates same different another other order front back middle part fact general particular place places
south north east west fact time line bed love tears shock spite turn mind control charge light private secret
`);
/** Capitalized words after "in" that are not places ("in General", "in Group"). */
const NOT_PLACE_AFTER_IN = words(
  "General Particular Fact Total Contrast Short Brief Person Detail Group Private Public Recovery Remission " +
    "Reality Theory Practice Response Case Past Future Advance Return Order Time Class Love Pain Fear Bed Line " +
    "Charge Control Spite Light Tears Shock Denial Turn Common Mind Front Back Between Addition Part Writing " +
    "Hurricane Storm Typhoon Cyclone Tropical Wildfire",
);
const BARE_IN_RE = /(?<![A-Za-z])[Ii]n[ \t]+(?:the[ \t]+)?/g;
const LOWER_PLACE_Y = /\p{Ll}{3,}(?![\p{L}\p{N}])/yu;
/** "Lincoln Elementary School", "Roosevelt High School". */
const SCHOOL_RE =
  /(?<!\p{L})(?:\p{Lu}\p{Ll}+[ \t]+){1,3}(?:Elementary|Middle|High|Junior[ \t]+High|Intermediate|Primary)[ \t]+School\b/gu;

/** A single lower-case place word after a location cue ("lives in springfield"), or -1. */
function readLowerPlace(text: string, pos: number): number {
  const m = at(text, LOWER_PLACE_Y, pos);
  if (!m) return -1;
  const tok = m[0];
  const cap = capitalize(tok);
  if (NOT_LOWER_PLACE.has(tok) || wordLike(tok) || GEO_TOKENS.has(cap) || NON_NAME_WORDS.has(cap)) return -1;
  return pos + tok.length;
}

function detectAddresses(text: string, add: Add): void {
  each(text, STREET_RE, (m) => {
    let end = m.index + m[0].length;
    // ", Springfield" after a street line is the city.
    const comma = at(text, /\.?,[ \t]*/y, end);
    if (comma) {
      const cityEnd = readPlace(text, end + comma[0].length, false);
      if (cityEnd > 0) end = cityEnd;
    }
    add("ADDRESS", m.index, end);
  });
  each(text, PO_BOX_RE, (m) => add("ADDRESS", m.index, m.index + m[0].length));
  each(text, UNIT_RE, (m) => add("ADDRESS", m.index, m.index + m[0].length));
  each(text, COUNTY_RE, (m) => {
    const toks = m[0].split(/[ \t]+/);
    let start = m.index;
    while (toks.length > 1 && NON_NAME_WORDS.has(toks[0]!) && !PLACE_WORDS.has(toks[0]!)) {
      start += toks[0]!.length;
      toks.shift();
      while (/[ \t]/.test(text.charAt(start))) start++;
    }
    if (toks.length > 1) add("ADDRESS", start, m.index + m[0].length);
  });
  each(text, LOCATION_CUE_RE, (m) => {
    const pos = m.index + m[0].length;
    const num = at(text, /\d{1,6}[A-Za-z]?[ \t]+/y, pos); // "lives at 45 Oak"
    if (num) {
      const end = readPlace(text, pos + num[0].length, false);
      if (end > 0) add("ADDRESS", pos, end);
      return;
    }
    const end = readPlace(text, pos, false);
    if (end > 0) add("ADDRESS", pos, end);
    else {
      const lowEnd = readLowerPlace(text, pos); // "she lives in springfield"
      if (lowEnd > 0) add("ADDRESS", pos, lowEnd);
    }
  });
  each(text, BARE_IN_RE, (m) => {
    // "the Kroger in Dayton": a capitalized place after a bare "in" (strict: not a name or ordinary word).
    const pos = m.index + m[0].length;
    const tok = at(text, PLACE_TOKEN_Y, pos);
    if (!tok || NOT_PLACE_AFTER_IN.has(tok[0])) return;
    const end = readPlace(text, pos, true);
    if (end > 0) add("ADDRESS", pos, end);
  });
  each(text, LOWER_STREET_RE, (m) => {
    const toks = (m[1] ?? "").trim().split(/[ \t]+/);
    if (toks.some((t) => NOT_STREET_WORDS.has(t))) return;
    add("ADDRESS", m.index, m.index + m[0].length);
  });
  each(text, CITY_STATE_ZIP_RE, (m) => {
    const toks = m[1]!.split(/[ \t]+/);
    let start = m.index;
    while (toks.length > 0 && NON_NAME_WORDS.has(toks[0]!) && !PLACE_WORDS.has(toks[0]!)) {
      start += toks[0]!.length;
      toks.shift();
      while (/[ \t]/.test(text.charAt(start))) start++;
    }
    if (toks.length > 0 && !GEO_ALLOWED.has(toks.join(" "))) add("ADDRESS", start, m.index + m[1]!.length);
  });
  each(text, SCHOOL_RE, (m) => add("ADDRESS", m.index, m.index + m[0].length));
  each(text, BARE_FROM_RE, (m) => {
    const pos = m.index + m[0].length;
    const end = readPlace(text, pos, true);
    // "switched from Pristiq to Zoloft", "from Pristiq 50 mg": medication changes, not places.
    if (end > 0 && !/^[ \t]+(?:to\b|\d)/i.test(text.slice(end, end + 6))) add("ADDRESS", pos, end);
  });
  each(text, CITY_STATE_RE, (m) => {
    const city = m[1]!;
    const toks = city.split(/[ \t]+/);
    let start = m.index;
    while (toks.length > 0 && NON_NAME_WORDS.has(toks[0]!) && !PLACE_WORDS.has(toks[0]!)) {
      start += toks[0]!.length;
      toks.shift();
      while (/[ \t]/.test(text.charAt(start))) start++;
    }
    const rest = toks.join(" ");
    if (toks.length === 0 || GEO_ALLOWED.has(rest) || toks.every((t) => NON_NAME_WORDS.has(t))) return;
    add("ADDRESS", start, m.index + city.length);
  });
}

const ZIP_RE = /(?<![\w$#.,/:-])\d{5}(?:-\d{4})?(?![\w]|[.,:/]\d|-\d)/g;
const NOT_ZIP_AFTER =
  /^[ \t]*(?:mg|mcg|ug|ml|g|kg|lbs?|steps|calories|kcal|feet|ft|miles|mi|km|meters|words|people|persons|adults|patients|participants|cases|deaths|dollars|usd|units|iu|cells|copies|times|a[ \t]+(?:year|yr|month|week)|per[ \t]+(?:year|yr|month|week|hour)|\/[ \t]*(?:yr|year|mo|month)|annually|yearly|monthly|salary|income|in[ \t]+(?:savings|debt|bills))\b/i;
/** Money, not a ZIP: "earns 45000", "owes 12000". */
const NOT_ZIP_BEFORE = /(?:earns?|earning|makes|made|salary|income|paid|pays|owes|owed|debt|rent|saved|savings)[ \t]+(?:about|around|over|under|roughly)?[ \t]*$/i;

function detectZips(text: string, add: Add): void {
  each(text, ZIP_RE, (m) => {
    const end = m.index + m[0].length;
    if (NOT_ZIP_AFTER.test(text.slice(end, end + 20))) return;
    if (NOT_ZIP_BEFORE.test(text.slice(Math.max(0, m.index - 24), m.index))) return;
    add("ZIP", m.index, end);
  });
}

/* ------------------------------------------------------------------ */
/* DATE and AGE_OVER_89                                                 */
/* ------------------------------------------------------------------ */

const MONTH_SRC =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
/** Lower-case month words accepted as months (not "may", "march" or abbreviations, which are ordinary words). */
const LOWER_MONTHS_OK = words("january february april june july august september october november december");
const monthOk = (tok: string): boolean => tok !== tok.toLowerCase() || LOWER_MONTHS_OK.has(tok);
const dayOk = (d: string): boolean => Number(d) >= 1 && Number(d) <= 31;
const monthDayOk = (a: string, b: string): boolean => {
  const x = Number(a);
  const y = Number(b);
  return x >= 1 && y >= 1 && ((x <= 12 && y <= 31) || (x <= 31 && y <= 12));
};
const NOT_DATE_AFTER = /^[ \t]*(?:mg|mcg|ml|%|percent)/i;

const MONTH_DAY_RE = new RegExp(
  `\\b(${MONTH_SRC})\\.?[ \\t]+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?[ \\t]+(?:\\d{4}|'\\d{2})\\b)?`,
  "gi",
);
const DAY_MONTH_RE = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?[ \\t]+(?:of[ \\t]+)?(${MONTH_SRC})\\b\\.?(?:,?[ \\t]+\\d{4}\\b)?`,
  "gi",
);
const MONTH_YEAR_RE = new RegExp(`\\b(${MONTH_SRC})\\.?,?[ \\t]+(?:of[ \\t]+)?(?:(?:19|20)\\d{2}|'\\d{2})\\b`, "gi");
const NUMERIC_DATE_RE = /(?<![\d/.-])(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})(?!\d|[/.-]\d)/g;
const ISO_DATE_RE = /(?<![\d/.-])(?:19|20)\d{2}([/.-])(\d{1,2})\1(\d{1,2})(?!\d|[/.-]\d)/g;
const YEAR_MONTH_RE = /(?<![\d/.-])(?:19|20)\d{2}-(?:0[1-9]|1[0-2])(?!\d|[/.-]\d)/g;
/** "on 3/15", "since 8/10", "DOB 4/2": a short numeric date only counts after a date cue. */
const CUED_SHORT_DATE_RE =
  /(?<![A-Za-z])(?:on|since|born|dated?|DOB|D\.O\.B\.?|as[ \t]+of|admitted|discharged|effective|starting|started|began|beginning|seen|visit|appt|appointment|scheduled)(?![A-Za-z])[ \t]*:?[ \t]*(?:on[ \t]+)?(\d{1,2})[/-](\d{1,2})(?!\d|[/.-]\d)/gi;
const NOT_SHORT_DATE_AFTER =
  /^[ \t]*(?:days?|nights?|weeks?|months?|times|occasions|items|questions|sessions|scale|of|on|anxiety|pain|mood|distress|depression|suds|tablets?|tabs?|doses?|pills?|mg|capsules?|caps?|strength)\b/i;
/** A holiday with a year is a date ("Christmas 2023"). */
const HOLIDAY_YEAR_RE =
  /\b(?:Christmas(?:[ \t]+(?:Eve|Day))?|Thanksgiving|Easter|Halloween|Hanukkah|Passover|Ramadan|Diwali|Eid(?:[ \t]+al-\w+)?|Kwanzaa|Lunar[ \t]+New[ \t]+Year|New[ \t]+Year['’]?s(?:[ \t]+(?:Eve|Day))?|Valentine['’]?s[ \t]+Day|Independence[ \t]+Day|Fourth[ \t]+of[ \t]+July|July[ \t]+4th|Memorial[ \t]+Day|Labor[ \t]+Day|Mother['’]?s[ \t]+Day|Father['’]?s[ \t]+Day)[ \t,]+(?:of[ \t]+)?(?:19|20)\d{2}\b/gi;
const BIRTH_CUE_RE =
  /(?<![A-Za-z])(?:DOB|D\.O\.B\.?|date[ \t]+of[ \t]+birth|birth[ \t]*date|birthday|b-?day|born(?:[ \t]+on)?)(?![A-Za-z])[ \t]*(?:is|was|=|:|-)?[ \t]*/gi;
const BIRTH_VALUE_Y = new RegExp(
  `(?:\\d{1,2}[/.-]\\d{1,2}(?:[/.-]\\d{2,4})?(?![\\d/])|\\d{6,8}(?!\\d)|${MONTH_SRC}\\.?[ \\t]+\\d{1,2}(?:st|nd|rd|th)?(?:,?[ \\t]+\\d{4})?\\b|\\d{1,2}(?:st|nd|rd|th)?[ \\t]+(?:of[ \\t]+)?${MONTH_SRC}\\b\\.?(?:,?[ \\t]+\\d{4})?)`,
  "iy",
);

function detectDates(text: string, add: Add): void {
  each(text, MONTH_DAY_RE, (m) => {
    const end = m.index + m[0].length;
    // A lower-case "may" / "march" is a month only with an ordinal day ("seen on march 3rd").
    const ordinal = /^\.?[ \t]+\d{1,2}(?:st|nd|rd|th)\b/i.test(m[0].slice(m[1]!.length));
    if ((monthOk(m[1]!) || ordinal) && dayOk(m[2]!) && !NOT_DATE_AFTER.test(text.slice(end, end + 8))) add("DATE", m.index, end);
  });
  each(text, HOLIDAY_YEAR_RE, (m) => add("DATE", m.index, m.index + m[0].length));
  each(text, DAY_MONTH_RE, (m) => {
    if (monthOk(m[2]!) && dayOk(m[1]!)) add("DATE", m.index, m.index + m[0].length);
  });
  each(text, MONTH_YEAR_RE, (m) => {
    if (monthOk(m[1]!)) add("DATE", m.index, m.index + m[0].length);
  });
  each(text, NUMERIC_DATE_RE, (m) => {
    if (monthDayOk(m[1]!, m[3]!)) add("DATE", m.index, m.index + m[0].length);
  });
  each(text, ISO_DATE_RE, (m) => {
    const mo = Number(m[2]);
    if (mo >= 1 && mo <= 12 && dayOk(m[3]!)) add("DATE", m.index, m.index + m[0].length);
  });
  each(text, YEAR_MONTH_RE, (m) => add("DATE", m.index, m.index + m[0].length));
  each(text, CUED_SHORT_DATE_RE, (m) => {
    const end = m.index + m[0].length;
    const start = end - (m[1]!.length + 1 + m[2]!.length);
    if (m[1] === "9" && m[2] === "11") return; // "since 9/11": an event everyone shares, not a personal date
    if (monthDayOk(m[1]!, m[2]!) && !NOT_SHORT_DATE_AFTER.test(text.slice(end, end + 14))) add("DATE", start, end);
  });
  each(text, BIRTH_CUE_RE, (m) => {
    const pos = m.index + m[0].length;
    const v = at(text, BIRTH_VALUE_Y, pos);
    if (v) add("DATE", pos, pos + v[0].length);
  });
}

const AGE_NUM = "(9\\d|1[01]\\d|12[0-5])";
const AGE_YEARS_OLD_RE = new RegExp(
  `\\b${AGE_NUM}[ \\t]*-?[ \\t]*(?:years?|yrs?|y)[ \\t]*-?[ \\t]*(?:old|of[ \\t]+age)\\b`,
  "gi",
);
const AGE_YO_RE = new RegExp(`\\b${AGE_NUM}[ \\t]*(?:yo|y/o|y\\.o\\.?|yoa)(?![A-Za-z])`, "gi");
const AGE_CUE_RE = new RegExp(`\\b(?:age|aged|ages|turned|turning)\\b[ \\t]*:?[ \\t]*${AGE_NUM}\\b(?![/.]\\d)`, "gi");
const NOT_AGE_AFTER =
  /^[ \t]*(?:%|percent|days?|weeks?|months?|minutes?|mins?|hours?|mg|mcg|ml|lbs?|pounds|kg|bpm|degrees|points|times|out[ \t]+of|\/|cm|mm|ms|seconds?|dollars|people)\b|^[ \t]*[%/]/i;
const AGE_DECADE_RE =
  /\b(?:in|into)[ \t]+(?:his|her|their|my|your)[ \t]+((?:early[ \t]+|mid[ \t-]*|late[ \t]+)?(?:(?:90|100)'?s|nineties))\b/gi;
/** "She is 93", "now 91", "turns 95": a bare number after a person verb (not a vital sign or score). */
const AGE_VERB_RE = new RegExp(`\\b(?:is|was|now|currently|turns|turned|turning)[ \\t]+${AGE_NUM}\\b(?![/.]\\d)`, "gi");
const NOT_AGE_BEFORE =
  /\b(?:pulse|heart[ \t]+rate|hr|bp|o2|spo2|sat|sats|saturation|score|weight|temp|temperature|glucose|sugar|level|rate|iq|percentile|grade|average|total|count|cholesterol|a1c|bmi|reading|result|phq-?9|gad-?7)\b[^.;\n]{0,12}$/i;
/** What may follow "is 93": the end of a clause or a few connecting words (never "123 Main Street"). */
const AGE_VERB_AFTER_OK =
  /^(?:[ \t]*(?:$|[.,;:!?)])|[ \t]+(?:and|but|so|now|today|this|with|who|still|living|lives|years?|yrs?|yo|y\/o)\b)/i;
/** "93 years and still driving": years without "old". */
const AGE_YEARS_RE = new RegExp(`\\b${AGE_NUM}[ \\t]*-?[ \\t]*(?:years?|yrs?)(?![A-Za-z])(?![ \\t]+ago)`, "gi");
const AGE_WORD =
  "(?:ninety(?:[ \\t-](?:one|two|three|four|five|six|seven|eight|nine))?|(?:a|one)[ \\t]+hundred(?:[ \\t]+(?:and[ \\t]+)?(?:one|two|three|four|five|six|seven|eight|nine|ten))?)";
const AGE_WORD_RE = new RegExp(
  `\\b(?:(?:age|aged|turned|turning|turns|is|was|now)[ \\t]+${AGE_WORD}\\b|${AGE_WORD}[ \\t]*-?[ \\t]*(?:years?|yrs?)(?![A-Za-z]))`,
  "gi",
);

function detectAges(text: string, add: Add): void {
  each(text, AGE_VERB_RE, (m) => {
    const end = m.index + m[0].length;
    if (!AGE_VERB_AFTER_OK.test(text.slice(end, end + 12)) || NOT_AGE_AFTER.test(text.slice(end, end + 12))) return;
    if (NOT_AGE_BEFORE.test(text.slice(Math.max(0, m.index - 30), m.index))) return;
    add("AGE_OVER_89", end - m[1]!.length, end);
  });
  each(text, AGE_YEARS_RE, (m) => add("AGE_OVER_89", m.index, m.index + m[1]!.length));
  each(text, AGE_WORD_RE, (m) => {
    const num = /(?:ninety|hundred)(?:[ \t-](?:and[ \t]+)?(?:one|two|three|four|five|six|seven|eight|nine|ten))?/i.exec(m[0]);
    const lead = /^(?:a|one)[ \t]+/i.exec(m[0].slice(num ? num.index - 4 : 0, num ? num.index : 0));
    if (!num) return;
    const start = m.index + num.index - (lead ? lead[0].length : 0);
    add("AGE_OVER_89", start, m.index + num.index + num[0].length);
  });
  each(text, AGE_YEARS_OLD_RE, (m) => add("AGE_OVER_89", m.index, m.index + m[1]!.length));
  each(text, AGE_YO_RE, (m) => add("AGE_OVER_89", m.index, m.index + m[1]!.length));
  each(text, AGE_CUE_RE, (m) => {
    const end = m.index + m[0].length;
    if (!NOT_AGE_AFTER.test(text.slice(end, end + 10))) add("AGE_OVER_89", end - m[1]!.length, end);
  });
  each(text, AGE_DECADE_RE, (m) => {
    const end = m.index + m[0].length;
    add("AGE_OVER_89", end - m[1]!.length, end);
  });
}

/* ------------------------------------------------------------------ */
/* PHONE, FAX                                                           */
/* ------------------------------------------------------------------ */

const PHONE_RES: readonly RegExp[] = [
  // US/NANP: (555) 123-4567, 555-123-4567, 555.123.4567, 555 123 4567, +1 555 123 4567, 1-800-555-1234, ext.
  /(?<![\w+])(?:\+?1[ \t.-]?)?(?:\(\d{3}\)[ \t.-]?|\d{3}[ \t.-])\d{3}[ \t.-]\d{4}(?!\w)(?:[ \t]*(?:x|ext\.?|extension)[ \t]*\d{1,6}\b)?/gi,
  // Bare 10 digits, or 11 starting with 1.
  /(?<![\w.+-])1?\d{10}(?!\w|[.-]\d)/g,
  // International with "+": +44 20 7946 0958, +91 98765 43210, +61 (2) 9374 4000.
  /(?<![\w+])\+(?:\d[ \t.()-]{0,2}){7,14}\d(?!\d)/g,
  // Trunk-prefixed national numbers: 020 7946 0958.
  /(?<![\w+])0\d{2,4}[ \t-]\d{3,4}[ \t-]\d{3,4}(?!\w)/g,
];
/** Local 7-digit numbers (555-1234); skipped when followed by a unit, which marks a numeric range. */
const PHONE7_RE = /(?<![\w./-])\d{3}[-.]\d{4}(?!\w|[./-]\d)/g;
const FAX_BEFORE =
  /(?:fax|facsimile|telefax)(?:[ \t]*(?:number|no\.?|#))?[ \t]*[:#=-]?[ \t]*$|(?<![A-Za-z])F[ \t]*:[ \t]*$/i;

/** "phone 555 1234", "call her at 555 1234": a 7-digit number with a space needs a phone cue. */
const PHONE_CUED7_RE =
  /(?<![A-Za-z])(?:phone|cell|mobile|tel|telephone|call|text|number|reach(?:ed)?)(?:[ \t]+(?:her|him|them|me|number|no\.?|#))?(?:[ \t]+at)?[ \t]*[:#-]?[ \t]*(\d{3}[ .-]\d{4})(?![\d])/gi;

function detectPhones(text: string, add: Add): void {
  each(text, PHONE_CUED7_RE, (m) => {
    const end = m.index + m[0].length;
    add(FAX_BEFORE.test(text.slice(Math.max(0, m.index - 24), m.index)) ? "FAX" : "PHONE", end - m[1]!.length, end, CUED_BONUS);
  });
  const push = (start: number, end: number): void => {
    const before = text.slice(Math.max(0, start - 24), start);
    add(FAX_BEFORE.test(before) ? "FAX" : "PHONE", start, end);
  };
  for (const re of PHONE_RES) {
    each(text, re, (m) => {
      const n = digitCount(m[0].replace(/[ \t]*(?:x|ext\.?|extension)[ \t]*\d+$/i, ""));
      if (n >= 8 && n <= 15) push(m.index, m.index + m[0].length);
    });
  }
  each(text, PHONE7_RE, (m) => {
    const end = m.index + m[0].length;
    if (!NOT_ZIP_AFTER.test(text.slice(end, end + 14))) push(m.index, end);
  });
}

/* ------------------------------------------------------------------ */
/* EMAIL, URL (incl. @handles), IP, MAC                                 */
/* ------------------------------------------------------------------ */

const EMAIL_LOCAL_CHAR = /[A-Za-z0-9._%+-]/;
const EMAIL_DOMAIN_Y = /(?:[A-Za-z0-9-]{1,63}\.){1,8}[A-Za-z]{2,24}(?![A-Za-z0-9-])/y;
const HANDLE_Y = /[A-Za-z_][A-Za-z0-9_.]{1,29}/y;
/** "@home", "@work": shorthand for "at", not a social handle. */
const HANDLE_WORDS = words(
  "home work school night times risk baseline bedtime rest least most all this that the noon midnight lunch dinner breakfast church gym",
);

function detectEmailsAndHandles(text: string, add: Add): void {
  for (let i = text.indexOf("@"); i !== -1; i = text.indexOf("@", i + 1)) {
    let s = i;
    while (s > 0 && i - s < 64 && EMAIL_LOCAL_CHAR.test(text.charAt(s - 1))) s--;
    while (s < i && text.charAt(s) === ".") s++;
    if (s < i) {
      const dom = at(text, EMAIL_DOMAIN_Y, i + 1);
      if (dom) add("EMAIL", s, i + 1 + dom[0].length);
      continue;
    }
    const h = at(text, HANDLE_Y, i + 1);
    if (!h) continue;
    const handle = h[0].replace(/\.+$/, "");
    if (handle.length >= 2 && !HANDLE_WORDS.has(handle.toLowerCase())) add("URL", i, i + 1 + handle.length);
  }
}

/** "jdoe(at)gmail.com", "jdoe [at] gmail [dot] com", "jdoe at gmail dot com". */
const OBFUSCATED_EMAIL_RE =
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9][A-Za-z0-9._%+-]{0,63}[ \t]*(?:\((?:at)\)|\[(?:at)\]|\{(?:at)\}|[ \t]at[ \t])[ \t]*[A-Za-z0-9-]{1,63}(?:[ \t]*(?:\.|\(dot\)|\[dot\]|[ \t]dot[ \t])[ \t]*[A-Za-z0-9-]{1,63}){0,3}[ \t]*(?:\.|\(dot\)|\[dot\]|[ \t]dot[ \t])[ \t]*(?:com|org|net|edu|gov|io|co|us|me|info|uk|ca|au)(?![A-Za-z0-9])/gi;
/** "her blog janesmithwrites.com": a bare domain with no path (label of 6+ characters). */
const BARE_DOMAIN_RE =
  /(?<![\w@.\/-])([A-Za-z0-9][A-Za-z0-9-]{5,62})\.(?:com|org|net|io|co|us|info|biz|me|blog|app|site|online|page|tv|xyz)(?![\w-]|\.[A-Za-z0-9])/gi;
/** Public resources and big platforms: naming them identifies no one. */
const PUBLIC_DOMAINS = words(
  "findahelpline 988lifeline crisistextline therapistaid psychologytoday nami samhsa google facebook instagram " +
    "youtube amazon reddit tiktok twitter wikipedia webmd mayoclinic healthline betterhelp talkspace headspace " +
    "calm zoom gmail yahoo outlook hotmail icloud linkedin spotify netflix walmart target pinterest discord " +
    "whatsapp telegram snapchat phqscreeners getselfhelp",
);
/** "IG: janedoe92", "tiktok @jane_d", "username is jdoe". */
const HANDLE_CUE_RE =
  /(?<![A-Za-z])(?:IG|insta|instagram|tiktok|tik[ \t]+tok|snap|snapchat|twitter|threads|username|user[ \t]+name|handle|screen[ \t]?name|gamertag|discord|reddit|fb|facebook)(?![A-Za-z])(?:[ \t]*(is|:|=|@|-)[ \t]*|[ \t]+(?:(?:handle|name|account|id)[ \t]*(?:is|:)?[ \t]*)?)@?([A-Za-z0-9_][A-Za-z0-9_.]{2,29})/gi;

const URL_CHARS = "[^\\s<>\"'`\\[\\]{}|\\\\^]";
const URL_RE = new RegExp(`\\b(?:https?://|www\\.)${URL_CHARS}+`, "gi");
const BARE_URL_RE = new RegExp(
  "(?<![\\w@.-])(?:[A-Za-z0-9-]{1,63}\\.){1,6}(?:com|org|net|edu|gov|io|co|us|info|biz|me|ly|app|health|uk|ca|au|de|fr|in|tv|ai|dev|link|site|online|page|social)" +
    `/${URL_CHARS}*`,
  "gi",
);

function detectUrls(text: string, add: Add): void {
  each(text, OBFUSCATED_EMAIL_RE, (m) => add("EMAIL", m.index, m.index + m[0].length));
  each(text, BARE_DOMAIN_RE, (m) => {
    if (!PUBLIC_DOMAINS.has(m[1]!.toLowerCase())) add("URL", m.index, m.index + m[0].length);
  });
  each(text, HANDLE_CUE_RE, (m) => {
    const value = m[2]!.replace(/\.+$/, "");
    // With an explicit separator ("IG: jane") any value counts; otherwise it must look like a handle.
    if (!m[1] && !/[\d_.]/.test(value)) return;
    const end = m.index + m[0].length - (m[2]!.length - value.length);
    add("URL", end - value.length, end, CUED_BONUS);
  });
  for (const re of [URL_RE, BARE_URL_RE]) {
    each(text, re, (m) => {
      let end = m.index + m[0].length;
      while (end > m.index && /[.,;:!?)\]}'"]/.test(text.charAt(end - 1))) end--;
      add("URL", m.index, end);
    });
  }
}

const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4_RE = new RegExp(`(?<![\\d.])${OCTET}(?:\\.${OCTET}){3}(?!\\d|\\.\\d)`, "g");
const IPV6_CANDIDATE_RE = /(?<![0-9A-Za-z:])(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?![0-9A-Za-z:])/g;
const MAC_RE = /(?<![0-9A-Fa-f:-])[0-9A-Fa-f]{2}([:-])(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}(?![0-9A-Fa-f:-])/g;

function validIpv6(s: string): boolean {
  if (s.includes(":::")) return false;
  const halves = s.split("::");
  if (halves.length > 2) return false;
  const groups = halves.flatMap((h) => (h === "" ? [] : h.split(":")));
  if (groups.some((g) => !/^[0-9A-Fa-f]{1,4}$/.test(g))) return false;
  return halves.length === 2 ? groups.length >= 1 && groups.length <= 7 : groups.length === 8;
}

function detectIps(text: string, add: Add): void {
  each(text, IPV4_RE, (m) => add("IP", m.index, m.index + m[0].length));
  each(text, IPV6_CANDIDATE_RE, (m) => {
    if (validIpv6(m[0])) add("IP", m.index, m.index + m[0].length);
  });
  each(text, MAC_RE, (m) => add("DEVICE", m.index, m.index + m[0].length));
}

/* ------------------------------------------------------------------ */
/* Cued identifiers: SSN, MRN, HEALTH_PLAN_ID, ACCOUNT, LICENSE,        */
/* VEHICLE, DEVICE, BIOMETRIC, OTHER_ID                                 */
/* ------------------------------------------------------------------ */

const QUALIFIER_WORDS = "id|identifier|number|num|no|#";
const CUE_TAIL = "(?:[ \\t]+(?:is|was|of))?[ \\t]*[:#=]?[ \\t]*";

/** Builds a cue regex whose match ends exactly where the identifier value starts. */
function cue(core: string, qualifier: "optional" | "required" = "optional", extraQualifiers = ""): RegExp {
  const q = extraQualifiers ? `(?:${QUALIFIER_WORDS}|${extraQualifiers})` : `(?:${QUALIFIER_WORDS})`;
  const qual = qualifier === "required" ? `[ \\t]*${q}\\.?` : `(?:[ \\t]*${q}\\.?)?`;
  return new RegExp(`(?<![A-Za-z0-9])(?:${core})(?![A-Za-z])${qual}${CUE_TAIL}`, "gi");
}

/** Generic identifier value: alphanumerics with internal - . / separators. */
const ID_VALUE_Y = /[A-Za-z0-9](?:[A-Za-z0-9]|[-./](?=[A-Za-z0-9]))*/y;
const SSN_VALUE_Y = /(?:\d{3}|[xX*]{3})[- ]?(?:\d{2}|[xX*]{2})[- ]?\d{4}(?!\d)|\d{9}(?!\d)|\d{4}(?!\d)/y;
const PLATE_VALUE_Y = /[A-HJ-NPR-Z0-9]{17}(?![A-Za-z0-9])|[A-Z0-9]{1,4}[ -]?[A-Z0-9]{1,5}(?![A-Za-z0-9])/y;
/** Doses, units, ordinals and times are clinical, not identifiers. */
const DOSE_TOKEN =
  /^\d+(?:\.\d+)?(?:mg|mcg|ug|ml|g|kg|lbs?|mmhg|bpm|hrs?|mins?|am|pm|st|nd|rd|th|x|k|mm|cm|m|km|mi|iu|units?|cc|meq|mmol|ng|pg|s|secs?|ms|yrs?|yo|wks?|mos?|days?|d|h)$/i;

function idValueOk(v: string, minDigits: number): boolean {
  return (
    v.length >= 4 &&
    digitCount(v) >= minDigits &&
    !/^(?:19|20)\d{2}$/.test(v) && // a bare year is allowed
    !DOSE_TOKEN.test(v)
  );
}

interface CueSpec {
  type: PhiType;
  re: RegExp;
  value?: RegExp;
  minDigits?: number;
}

const CUE_SPECS: readonly CueSpec[] = [
  {
    type: "SSN",
    re: cue("SSN|SS#|SS[ \\t]+no|soc(?:ial)?[ \\t]+sec(?:urity)?(?:[ \\t]+(?:number|no|num|card))?"),
    value: SSN_VALUE_Y,
  },
  {
    type: "SSN",
    re: cue("(?:SSN|SS#|soc(?:ial)?[ \\t]+sec(?:urity)?(?:[ \\t]+(?:number|no))?)[ \\t]+(?:last[ \\t]+(?:four|4)(?:[ \\t]+digits)?|ending[ \\t]+(?:in|with))"),
    value: SSN_VALUE_Y,
  },
  {
    type: "MRN",
    re: cue(
      "MRN|MR#|med(?:ical)?\\.?[ \\t]*rec(?:ord)?s?[ \\t]*(?:number|no|num|#)|medical[ \\t]+records?|chart(?:[ \\t]*(?:number|no|num|#|id))?|record[ \\t]*(?:number|no|num|#)|patient[ \\t]+(?:id|number|no|#)|pt\\.?[ \\t]*(?:id|#)|encounter[ \\t]+(?:id|number|no|#)|case[ \\t]+(?:number|no|#|id)|accession[ \\t]+(?:number|no|#)|hospital[ \\t]+(?:id|number|no|#)",
    ),
  },
  {
    type: "HEALTH_PLAN_ID",
    re: cue(
      "member|subscriber|beneficiary|policy(?:holder)?|insurance|insurer|health[ \\t]+plan|Medicaid|Medicare|MBI|HICN|Tricare|CHIP|BCBS|Blue[ \\t]+Cross(?:[ \\t]+Blue[ \\t]+Shield)?|Aetna|Cigna|Humana|UnitedHealthcare|United[ \\t]+Healthcare|Anthem|Kaiser|Molina|Centene|Ambetter",
    ),
  },
  { type: "HEALTH_PLAN_ID", re: cue("plan|group|grp", "required") },
  {
    type: "ACCOUNT",
    re: cue("account|acct|a/c|IBAN|routing|bank[ \\t]+account|(?:credit|debit|bank)[ \\t]+card|card"),
  },
  {
    type: "ACCOUNT",
    re: cue("billing|invoice|claim|confirmation|order|reference|ref|transaction|receipt", "required"),
  },
  {
    type: "LICENSE",
    re: cue(
      "licen[cs]e|lic\\.?|DL|driver'?s?[ \\t]+licen[cs]e|driving[ \\t]+licen[cs]e|certificate|cert\\.?|certification|NPI|DEA|permit|registration",
    ),
  },
  {
    type: "VEHICLE",
    re: cue("(?:licen[cs]e[ \\t]+)?plates?|tag|VIN|vehicle(?:[ \\t]+identification)?"),
    value: PLATE_VALUE_Y,
    minDigits: 1,
  },
  {
    type: "DEVICE",
    re: cue(
      "serial|S/N|SN|IMEI|MEID|ESN|UDI|device|pacemaker|implant|defibrillator|ICD[ \\t]+device|insulin[ \\t]+pump|CPAP|hearing[ \\t]+aid|cochlear[ \\t]+implant",
    ),
  },
  {
    type: "BIOMETRIC",
    re: cue(
      "finger[ \\t-]?prints?|thumb[ \\t-]?prints?|voice[ \\t-]?prints?|palm[ \\t-]?prints?|face[ \\t-]?prints?|retina(?:l)?(?:[ \\t]+scan)?|iris[ \\t]+scan|biometrics?|DNA(?:[ \\t]+(?:profile|sample|sequence))?|gait[ \\t]+signature",
      "optional",
      "template|hash|code|record|sample|scan",
    ),
  },
  {
    type: "OTHER_ID",
    re: cue(
      "passport|visa|green[ \\t]+card|alien[ \\t]+(?:registration|number)|A-number|state[ \\t]+ID|ID[ \\t]+card|student[ \\t]+ID|employee[ \\t]+ID|badge|inmate|booking|ID",
    ),
  },
];

function detectCuedIds(text: string, add: Add): void {
  for (const spec of CUE_SPECS) {
    each(text, spec.re, (m) => {
      const pos = m.index + m[0].length;
      const v = at(text, spec.value ?? ID_VALUE_Y, pos);
      if (!v) return;
      const value = v[0].trim();
      const ok =
        spec.type === "SSN"
          ? true
          : spec.type === "VEHICLE"
            ? value.replace(/[ -]/g, "").length >= 2 && digitCount(value) >= (spec.minDigits ?? 1)
            : idValueOk(value, spec.minDigits ?? 2);
      if (ok) add(spec.type, pos, pos + value.length, CUED_BONUS);
    });
  }
}

const SSN_RE = /(?<![\d-])\d{3}-\d{2}-\d{4}(?!\d|-\d)|(?<![\d ])\d{3} \d{2} \d{4}(?!\d| \d)/g;
const CARD_RE = /(?<![\d-])(?:\d{4}([ -]?)\d{4}\1\d{4}\1\d{1,7}|\d{4}([ -])\d{6}\2\d{5})(?!\d|[ -]\d)/g;

function detectSsnsAndCards(text: string, add: Add): void {
  each(text, SSN_RE, (m) => add("SSN", m.index, m.index + m[0].length));
  each(text, CARD_RE, (m) => add("ACCOUNT", m.index, m.index + m[0].length));
}

/* ------------------------------------------------------------------ */
/* OTHER_ID (plus standalone VIN and Medicare MBI formats)              */
/* ------------------------------------------------------------------ */

const ID_TOKEN_RE = /(?<![A-Za-z0-9])[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9]))*(?![A-Za-z0-9])/g;
const VIN_TOKEN = /^[A-HJ-NPR-Z0-9]{17}$/;
const MBI_CHAR = "[AC-HJKMNP-RT-Y]";
const MBI_TOKEN = new RegExp(
  `^[1-9]${MBI_CHAR}[0-9AC-HJKMNP-RT-Y]\\d-?${MBI_CHAR}[0-9AC-HJKMNP-RT-Y]\\d-?${MBI_CHAR}{2}\\d{2}$`,
);
const HASH_ID_RE = /(?<![A-Za-z0-9&])#[ \t]?(?:\d[\d-]{2,}\d|[A-Za-z]{1,3}-?\d{3,})(?![A-Za-z0-9])/g;
/** Gene/enzyme names such as CYP2C19 are clinical. */
const CLINICAL_TOKEN = /^(?:CYP\d|HLA-|SLC\d|MTHFR)/i;

function detectOtherIds(text: string, add: Add): void {
  each(text, ID_TOKEN_RE, (m) => {
    const tok = m[0];
    const start = m.index;
    const end = start + tok.length;
    const alnum = tok.replace(/-/g, "");
    const digits = digitCount(alnum);
    if (digits === 0) return;
    const hasLetter = /[A-Za-z]/.test(alnum);

    if (VIN_TOKEN.test(alnum) && hasLetter) return add("VEHICLE", start, end);
    if (MBI_TOKEN.test(tok)) return add("HEALTH_PLAN_ID", start, end);
    if (CLINICAL_TOKEN.test(tok) || DOSE_TOKEN.test(tok)) return;

    if (/^\d{4,5}-\d$/.test(tok)) return; // LOINC codes ("44249-1") are clinical
    const segs = tok.split("-");
    if (segs.length <= 2 && segs.every((s) => /^\d{1,4}$/.test(s) || DOSE_TOKEN.test(s))) return; // ranges "100-200", "2019-2021"
    if (!hasLetter) {
      // Part of a decimal or a comma-grouped number ("3.14159265", "1,000,000").
      const before = text.slice(Math.max(0, start - 2), start);
      const after = text.slice(end, end + 2);
      if (/\d[.,]$/.test(before) || /^[.,]\d/.test(after)) return;
      if (text.charAt(start - 1) === "$" || NOT_ZIP_AFTER.test(text.slice(end, end + 14))) return; // "$250000", "1200000 steps"
    }
    if (digits >= 6 || (hasLetter && alnum.length >= 6 && digits >= 3)) add("OTHER_ID", start, end);
  });
  each(text, HASH_ID_RE, (m) => add("OTHER_ID", m.index, m.index + m[0].length));
}

/* ------------------------------------------------------------------ */
/* Resolution and public API                                            */
/* ------------------------------------------------------------------ */

const DETECTORS: readonly ((text: string, add: Add) => void)[] = [
  detectEmailsAndHandles,
  detectUrls,
  detectIps,
  detectCuedIds,
  detectSsnsAndCards,
  detectPhones,
  detectDates,
  detectAges,
  detectAddresses,
  detectZips,
  detectNames,
  detectOtherIds,
];

/** Higher priority first, then longer span, then earlier start; drop anything overlapping an accepted span. */
function resolve(cands: Candidate[], length: number): PhiFinding[] {
  cands.sort((a, b) => b.priority - a.priority || b.end - b.start - (a.end - a.start) || a.start - b.start);
  const taken = new Uint8Array(length);
  const accepted: PhiFinding[] = [];
  for (const c of cands) {
    let free = true;
    for (let i = c.start; i < c.end; i++) {
      if (taken[i]) {
        free = false;
        break;
      }
    }
    if (!free) continue;
    taken.fill(1, c.start, c.end);
    accepted.push({ type: c.type, start: c.start, end: c.end });
  }
  return accepted.sort((a, b) => a.start - b.start);
}

const UNICODE_DASH = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/;
const UNICODE_SPACE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/;
const COMBINING = /\p{M}/u;

/**
 * The text the detectors see: accented letters folded to their base letter ("José García" ->
 * "Jose Garcia", so the name lists match, whether the accent was typed precomposed or as a separate
 * combining mark), Unicode dashes -> "-" and Unicode spaces -> " " ("555–123–4567"). Letters that do
 * not decompose (e.g. "Ł") are kept; the name regexes are Unicode-aware. `map[i]` is the index in the
 * original text of scan character i (map[scan.length] = text.length), so findings point at the original.
 */
export function scanView(text: string): { scan: string; map: number[] } {
  let scan = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; ) {
    const ch = text.charAt(i);
    const code = ch.charCodeAt(0);
    let next = i + 1;
    let out = ch;
    if (code >= 0xd800 && code <= 0xdfff) out = ch; // surrogate halves stay one for one
    else if (UNICODE_DASH.test(ch)) out = "-";
    else if (UNICODE_SPACE.test(ch)) out = " ";
    else if (/\p{L}/u.test(ch)) {
      // A letter and any combining marks typed after it form one scan character.
      while (next < text.length && COMBINING.test(text.charAt(next))) next++;
      const base = text.slice(i, next).normalize("NFD").replace(/\p{M}/gu, "");
      out = base.length === 1 ? base : ch;
      if (base.length !== 1) next = i + 1;
    }
    scan += out;
    map.push(i);
    i = next;
  }
  map.push(text.length);
  return { scan, map };
}

/**
 * Detects and redacts Safe Harbor identifiers. Pure and synchronous.
 * `findings` index into the ORIGINAL text; `clean` swaps each finding for `[TYPE]`.
 */
export function scrubPHI(text: string): ScrubResult {
  if (typeof text !== "string" || text.length === 0) return { clean: typeof text === "string" ? text : "", findings: [] };
  const { scan, map } = scanView(text);
  const cands: Candidate[] = [];
  const add: Add = (type, start, end, bonus = 0) => {
    let s = start;
    let e = end;
    while (s < e && /\s/.test(scan.charAt(s))) s++;
    while (e > s && /\s/.test(scan.charAt(e - 1))) e--;
    const os = map[s] ?? text.length;
    const oe = map[e] ?? text.length;
    if (oe > os) cands.push({ type, start: os, end: oe, priority: PRIORITY[type] + bonus });
  };
  for (const detect of DETECTORS) detect(scan, add);

  const findings = resolve(cands, text.length);
  let clean = "";
  let last = 0;
  for (const f of findings) {
    clean += text.slice(last, f.start) + `[${f.type}]`;
    last = f.end;
  }
  clean += text.slice(last);
  return { clean, findings };
}

/** True when the text contains at least one likely identifier. */
export function containsPHI(text: string): boolean {
  return scrubPHI(text).findings.length > 0;
}

/** Counts findings per type, in order of first appearance, with human-readable labels. */
export function summarizeFindings(findings: readonly PhiFinding[]): { type: PhiType; label: string; count: number }[] {
  const counts = new Map<PhiType, number>();
  for (const f of [...findings].sort((a, b) => a.start - b.start)) counts.set(f.type, (counts.get(f.type) ?? 0) + 1);
  return [...counts].map(([type, count]) => ({ type, label: PHI_TYPE_LABELS[type], count }));
}
