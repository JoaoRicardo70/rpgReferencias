import { useSyncExternalStore } from 'react';

// Estado global mínimo: há captura de tela/voz em andamento (buffer de clipes ou gravação)? O Gravador
// liga; o resto do app (ex.: o botão flutuante) só mostra um indicador, para o usuário nunca esquecer
// que há captura. O Gravador pode estar montado em mais de um lugar (aba própria e sub-aba do Oráculo),
// por isso as capturas são contadas em vez de guardadas num único "ligado/desligado".
let manual = false;
let capturas = 0;
const ouvintes = new Set();

function derivado() {
    return manual || capturas > 0;
}

function avisar(antes) {
    if (derivado() !== antes) ouvintes.forEach(fn => fn());
}

export function definirBufferLigado(valor) {
    const antes = derivado();
    manual = !!valor;
    avisar(antes);
}

// Registra uma captura em andamento; devolve a função que a desregistra (idempotente).
export function registrarCapturaAtiva() {
    const antes = derivado();
    capturas += 1;
    avisar(antes);
    let ativa = true;
    return () => {
        if (!ativa) return;
        ativa = false;
        const anterior = derivado();
        capturas = Math.max(0, capturas - 1);
        avisar(anterior);
    };
}

export function haCapturaEmAndamento() {
    return capturas > 0;
}

export function lerBufferLigado() {
    return derivado();
}

function assinar(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
}

export function useBufferLigado() {
    return useSyncExternalStore(assinar, lerBufferLigado, lerBufferLigado);
}
