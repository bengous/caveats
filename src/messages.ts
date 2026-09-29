// Every user-facing string of the web UI, in each supported language. The CLI
// uses the English labels.
import type { IntentJudgments } from './judge.ts';
import { MAX_PDF_BYTES } from './limits.ts';
import type { PdfProblem } from './pdfium.ts';
import type { HiddenReason } from './scan.ts';

const LIMIT_MB = MAX_PDF_BYTES / (1024 * 1024);

export const LANGS = ['en', 'fr'] as const;
export type Lang = (typeof LANGS)[number];

export const isLang = (value: string | null | undefined): value is Lang => LANGS.some((lang) => lang === value);

export const INTENT_KEYS = [
    'instructsAi',
    'keywordStuffing',
    'claimsAbsentFromVisible',
    'selfAwareWink',
    'templateArtifact',
] as const satisfies readonly (keyof IntentJudgments)[];

export const STATIC_KEYS = [
    'headline',
    'lede',
    'chooseFile',
    'dropHint',
    'limitHint',
    'privacy',
    'again',
    'langLabel',
] as const satisfies readonly (keyof StaticMessages)[];

/** Plain strings the page fills into `[data-i18n]` elements. */
export interface StaticMessages {
    readonly headline: string;
    readonly lede: string;
    readonly chooseFile: string;
    readonly dropHint: string;
    readonly limitHint: string;
    readonly privacy: string;
    readonly again: string;
    readonly langLabel: string;
}

export interface Messages extends StaticMessages {
    readonly reasons: Readonly<Record<HiddenReason, string>>;
    readonly intent: Readonly<Record<keyof IntentJudgments, string>>;
    /** `hiddenPassages` counts the passages lit on this page. */
    readonly pageAlt: (page: number, hiddenPassages: number) => string;
    readonly viewLabel: string;
    readonly viewPerson: string;
    readonly viewMachine: string;
    readonly cleanTitle: string;
    readonly cleanNote: string;
    readonly reviewTitle: string;
    readonly reviewNote: (count: number) => string;
    readonly passagesTitle: string;
    /** `page` is null when the CV has a single page. */
    readonly where: (page: number | null, reasons: string) => string;
    readonly intentTitle: string;
    readonly intentNote: string;
    /** `code` is trusted markup for the environment variable name. */
    readonly jevOff: (code: string) => string;
    readonly jevFailed: string;
    readonly emptyFile: string;
    readonly errorTitle: string;
    readonly errorReason: (reason: string) => string;
    readonly pdfProblems: Readonly<Record<PdfProblem, string>>;
    readonly tooManyPages: (pageCount: number, maxPages: number) => string;
    readonly pageTooLarge: (page: number) => string;
    readonly checkFailed: string;
    readonly errorNext: string;
    readonly reading: (fileName: string) => string;
    readonly tooLarge: string;
    readonly serverDown: string;
    readonly refused: string;
}

const en: Messages = {
    headline: 'See the text in a CV that only machines can read.',
    lede: 'Hidden passages light up on the page, Jev judges what they are for, and a person makes the call.',
    chooseFile: 'Choose a PDF',
    dropHint: 'or drop it anywhere on this page',
    limitHint: `PDF, ${LIMIT_MB} MB at most`,
    privacy:
        'The PDF is read on this machine. When hidden text is found and Jev is on, the text of the CV goes to TypeSafe to be judged.',
    again: 'Another CV',
    langLabel: 'Language',
    reasons: {
        'invisible-render-mode': 'invisible render mode',
        'tiny-font': 'font under 2 pt',
        'off-page': 'outside the page',
        'no-contrast': 'no contrast with the background',
    },
    intent: {
        instructsAi: 'tells an AI what to do or conclude',
        keywordStuffing: 'keyword stuffing',
        claimsAbsentFromVisible: 'claims skills the visible CV does not mention',
        selfAwareWink: 'an open joke rather than an attempt to deceive',
        templateArtifact: 'leftover template content',
    },
    pageAlt: (page, hiddenPassages) =>
        hiddenPassages === 0
            ? `CV, page ${page}`
            : `CV, page ${page}, ${hiddenPassages} hidden ${hiddenPassages === 1 ? 'passage' : 'passages'}`,
    viewLabel: 'View',
    viewPerson: 'Person',
    viewMachine: 'Machine',
    cleanTitle: 'Nothing hidden',
    cleanNote: 'A person and a machine read the same page.',
    reviewTitle: 'A person should look at this',
    reviewNote: (count) =>
        `${count} hidden ${count === 1 ? 'passage' : 'passages'} found. This tool never rejects a candidate.`,
    passagesTitle: 'Hidden passages',
    where: (page, reasons) => (page === null ? reasons : `Page ${page}: ${reasons}`),
    intentTitle: 'What Jev reads in the hidden text',
    intentNote: 'Probability that each statement is true.',
    jevOff: (code) => `Jev is off. Set ${code} and restart to judge what the hidden text is for.`,
    jevFailed: 'Jev could not be reached, so the purpose of the hidden text was not judged. Try again later.',
    emptyFile: 'The file is empty.',
    errorTitle: 'This file could not be read',
    errorReason: (reason) => `Reason: ${reason}`,
    pdfProblems: {
        unreadable: 'the file cannot be opened',
        corrupted: 'the file is not a PDF, or it is corrupted',
        password: 'the PDF is password protected',
        security: 'the PDF uses a security scheme this tool cannot read',
        other: 'the PDF cannot be read',
    },
    tooManyPages: (pageCount, maxPages) => `the PDF has ${pageCount} pages, and this server checks ${maxPages} at most`,
    pageTooLarge: (page) => `page ${page} is larger than the paper a CV uses (A4, US Letter, US Legal)`,
    checkFailed: 'the server could not check this file (see the server log)',
    errorNext: 'Try another PDF.',
    reading: (fileName) => `Reading ${fileName}…`,
    tooLarge: `This file is larger than ${LIMIT_MB} MB. Choose a smaller PDF.`,
    serverDown: 'The local server did not answer. Check that caveats serve is still running.',
    refused: 'The server refused the request. Open this page at 127.0.0.1 or localhost.',
};

// French typography: a no-break space before `:` and `;`.
const fr: Messages = {
    headline: 'Voyez le texte d’un CV que seules les machines peuvent lire.',
    lede: 'Les passages cachés s’allument sur la page, Jev juge à quoi ils servent, et une personne décide.',
    chooseFile: 'Choisir un PDF',
    dropHint: 'ou déposez-le n’importe où sur la page',
    limitHint: `PDF, ${LIMIT_MB} Mo au maximum`,
    privacy:
        'Le PDF est lu sur cette machine. Si du texte caché est trouvé et que Jev est activé, le texte du CV part chez TypeSafe pour être jugé.',
    again: 'Autre CV',
    langLabel: 'Langue',
    reasons: {
        'invisible-render-mode': 'mode de rendu invisible',
        'tiny-font': 'police de moins de 2 pt',
        'off-page': 'hors de la page',
        'no-contrast': 'aucun contraste avec le fond',
    },
    intent: {
        instructsAi: 'donne des ordres à une IA',
        keywordStuffing: 'bourrage de mots-clés',
        claimsAbsentFromVisible: 'revendique des compétences absentes du CV visible',
        selfAwareWink: 'une blague assumée plutôt qu’une tromperie',
        templateArtifact: 'un reste de modèle de mise en page',
    },
    pageAlt: (page, hiddenPassages) =>
        hiddenPassages === 0
            ? `CV, page ${page}`
            : `CV, page ${page}, ${hiddenPassages} ${hiddenPassages === 1 ? 'passage caché' : 'passages cachés'}`,
    viewLabel: 'Vue',
    viewPerson: 'Personne',
    viewMachine: 'Machine',
    cleanTitle: 'Rien de caché',
    cleanNote: 'Une personne et une machine lisent la même page.',
    reviewTitle: 'Une personne doit regarder ce CV',
    reviewNote: (count) =>
        count === 1
            ? '1 passage caché trouvé. Cet outil ne rejette jamais un candidat.'
            : `${count} passages cachés trouvés. Cet outil ne rejette jamais un candidat.`,
    passagesTitle: 'Passages cachés',
    where: (page, reasons) => (page === null ? reasons : `Page ${page} : ${reasons}`),
    intentTitle: 'Ce que Jev lit dans le texte caché',
    intentNote: 'Probabilité que chaque affirmation soit vraie.',
    jevOff: (code) => `Jev est désactivé. Définissez ${code} et relancez pour juger à quoi sert le texte caché.`,
    jevFailed: 'Jev n’a pas pu être joint, le rôle du texte caché n’a donc pas été jugé. Réessayez plus tard.',
    emptyFile: 'Le fichier est vide.',
    errorTitle: 'Ce fichier n’a pas pu être lu',
    errorReason: (reason) => `Raison : ${reason}`,
    pdfProblems: {
        unreadable: 'le fichier ne peut pas être ouvert',
        corrupted: 'le fichier n’est pas un PDF, ou il est corrompu',
        password: 'le PDF est protégé par un mot de passe',
        security: 'le PDF utilise un mode de protection que cet outil ne sait pas lire',
        other: 'le PDF ne peut pas être lu',
    },
    tooManyPages: (pageCount, maxPages) => `le PDF a ${pageCount} pages, et ce serveur en vérifie ${maxPages} au plus`,
    pageTooLarge: (page) => `la page ${page} dépasse le papier d’un CV (A4, US Letter, US Legal)`,
    checkFailed: 'le serveur n’a pas pu vérifier ce fichier (voir le journal du serveur)',
    errorNext: 'Essayez un autre PDF.',
    reading: (fileName) => `Lecture de ${fileName}…`,
    tooLarge: `Ce fichier dépasse ${LIMIT_MB} Mo. Choisissez un PDF plus petit.`,
    serverDown: 'Le serveur local ne répond pas. Vérifiez que caveats serve tourne toujours.',
    refused: 'Le serveur a refusé la requête. Ouvrez cette page à l’adresse 127.0.0.1 ou localhost.',
};

export const MESSAGES = { en, fr } as const satisfies Record<Lang, Messages>;
