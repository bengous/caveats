import { MAX_PDF_BYTES } from '../src/limits.ts';
import type { Lang } from '../src/messages.ts';
import { isLang, MESSAGES, STATIC_KEYS } from '../src/messages.ts';

type View = 'person' | 'machine';

const FIRST_LOOK_MS = 700;
const SWEEP_MS = 1400;
const LANG_STORAGE_KEY = 'caveats.lang';
const reducedMotion = globalThis.matchMedia('(prefers-reduced-motion: reduce)');

function required<T>(element: T | null, selector: string): T {
    if (element === null) {
        throw new Error(`the page has no ${selector}`);
    }
    return element;
}

const input = required(document.querySelector<HTMLInputElement>('.dropzone input'), '.dropzone input');
const status = required(document.querySelector<HTMLElement>('.status'), '.status');
const problem = required(document.querySelector<HTMLElement>('.alert'), '.alert');
const slot = required(document.querySelector<HTMLElement>('.result-slot'), '.result-slot');
const again = required(document.querySelector<HTMLButtonElement>('.again'), '.again');

function savedLang(): string | null {
    try {
        return localStorage.getItem(LANG_STORAGE_KEY);
    } catch {
        // Storage blocked (private window, previews): the browser language decides.
        return null;
    }
}

function saveLang(lang: Lang): void {
    try {
        localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
        // Storage blocked: the choice lasts until the page is closed.
    }
}

const stored = savedLang();
let currentLang: Lang = isLang(stored) ? stored : navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';

function applyLang(lang: Lang): void {
    currentLang = lang;
    document.documentElement.lang = lang;
    const messages = MESSAGES[lang];
    for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
        const key = STATIC_KEYS.find((candidate) => candidate === element.dataset['i18n']);
        if (key !== undefined) {
            element.textContent = messages[key];
        }
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-set-lang]')) {
        button.setAttribute('aria-pressed', String(button.dataset['setLang'] === lang));
    }
    document.querySelector('.lang-switch')?.setAttribute('aria-label', messages.langLabel);
}

function sweepLamps(sheets: HTMLElement): void {
    for (const lamp of sheets.querySelectorAll<HTMLElement>('.lamp')) {
        lamp.animate(
            [
                { top: '0%', opacity: 1 },
                { top: '100%', opacity: 1, offset: 0.9 },
                { top: '100%', opacity: 0 },
            ],
            { duration: SWEEP_MS, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' },
        );
    }
}

function setView(sheets: HTMLElement, radios: readonly HTMLInputElement[], view: View): void {
    sheets.dataset['view'] = view;
    for (const radio of radios) {
        radio.checked = radio.value === view;
    }
}

function showView(sheets: HTMLElement, radios: readonly HTMLInputElement[], view: View): void {
    const unchanged = sheets.dataset['view'] === view;
    setView(sheets, radios, view);
    if (view === 'machine' && !unchanged && !reducedMotion.matches) {
        sweepLamps(sheets);
    }
}

interface Arrival {
    /** Whether the page starts in the person view and the lamp goes on after a first look. */
    readonly intro: boolean;
    readonly view: View;
}

function wireResult({ intro, view }: Arrival): void {
    const sheets = slot.querySelector<HTMLElement>('.sheets');
    const radios = [...slot.querySelectorAll<HTMLInputElement>('.view-switch input')];
    if (sheets === null || radios.length === 0) {
        return;
    }
    const firstLook = intro
        ? setTimeout(
              () => {
                  showView(sheets, radios, 'machine');
              },
              reducedMotion.matches ? 0 : FIRST_LOOK_MS,
          )
        : undefined;
    for (const radio of radios) {
        radio.addEventListener('click', () => {
            clearTimeout(firstLook);
        });
        radio.addEventListener('change', () => {
            showView(sheets, radios, radio.value === 'person' ? 'person' : 'machine');
        });
    }
    if (!intro) {
        setView(sheets, radios, view);
    }
}

let currentFile: File | null = null;
let pending: AbortController | null = null;

function currentView(): View {
    return slot.querySelector<HTMLElement>('.sheets')?.dataset['view'] === 'machine' ? 'machine' : 'person';
}

async function check(file: File, { intro }: { readonly intro: boolean }): Promise<void> {
    const messages = MESSAGES[currentLang];
    if (file.size > MAX_PDF_BYTES) {
        input.value = '';
        showProblem(messages.tooLarge);
        return;
    }
    const view = currentView();
    pending?.abort();
    const request = new AbortController();
    pending = request;
    currentFile = file;
    problem.textContent = '';
    status.textContent = messages.reading(file.name);
    try {
        const response = await fetch(`/api/check?lang=${currentLang}`, {
            method: 'POST',
            body: file,
            headers: { 'content-type': 'application/pdf' },
            signal: request.signal,
        });
        if (response.headers.get('content-type')?.startsWith('text/html') !== true) {
            reset();
            showProblem(messages.refused);
            return;
        }
        slot.innerHTML = await response.text();
    } catch {
        if (!request.signal.aborted) {
            reset();
            showProblem(messages.serverDown);
        }
        return;
    }
    status.textContent = '';
    document.body.dataset['state'] = 'result';
    again.hidden = false;
    wireResult({ intro, view });
    if (intro) {
        globalThis.scrollTo({ top: 0 });
        slot.querySelector<HTMLElement>('.verdict')?.focus({ preventScroll: true });
    }
}

function showProblem(message: string): void {
    status.textContent = '';
    problem.textContent = message;
}

function reset(): void {
    pending?.abort();
    currentFile = null;
    status.textContent = '';
    problem.textContent = '';
    slot.replaceChildren();
    input.value = '';
    again.hidden = true;
    document.body.dataset['state'] = 'intake';
    input.focus();
}

input.addEventListener('change', () => {
    const file = input.files?.item(0);
    if (file !== null && file !== undefined) {
        void check(file, { intro: true });
    }
});

again.addEventListener('click', reset);

function switchLang(lang: string | undefined): void {
    if (!isLang(lang) || lang === currentLang) {
        return;
    }
    applyLang(lang);
    saveLang(lang);
    if (currentFile !== null) {
        void check(currentFile, { intro: false });
    }
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-set-lang]')) {
    button.addEventListener('click', () => {
        switchLang(button.dataset['setLang']);
    });
}

applyLang(currentLang);

document.addEventListener('dragover', (event) => {
    event.preventDefault();
    document.body.dataset['dragging'] = '';
});

document.addEventListener('dragleave', (event) => {
    if (event.relatedTarget === null) {
        delete document.body.dataset['dragging'];
    }
});

document.addEventListener('drop', (event) => {
    event.preventDefault();
    delete document.body.dataset['dragging'];
    const file = event.dataTransfer?.files.item(0);
    if (file !== null && file !== undefined) {
        reset();
        void check(file, { intro: true });
    }
});
