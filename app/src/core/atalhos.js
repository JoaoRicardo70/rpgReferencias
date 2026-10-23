// ==========================================
// ⌨️ TECLAS DE ATALHO — lógica pura. Cada ação tem um atalho padrão que o jogador pode trocar na tela de Configurações.
// Um atalho é um texto como "Ctrl+K" ou "Alt+Shift+L" (Ctrl vale também o Cmd do Mac). As escolhas ficam só neste aparelho.
// ==========================================

export const CHAVE_ATALHOS = 'rpg_atalhos';

// 'combinacao' = modificadores + uma tecla; 'modificador' = só os modificadores (a tecla é o número 1-9 da aba).
export const ACOES_ATALHO = [
    { id: 'paleta', nome: 'Abrir a busca "Ir para..."', tipo: 'combinacao', padrao: 'Ctrl+K' },
    { id: 'abas', nome: 'Ir direto para a aba 1 a 9 (modificador + número)', tipo: 'modificador', padrao: 'Alt' },
    { id: 'livroCombate', nome: 'Abrir/fechar o Livro de Combate (Mapa)', tipo: 'combinacao', padrao: 'Alt+L' },
    { id: 'gravarClipe', nome: 'Salvar o clipe do Gravador (enquanto grava)', tipo: 'combinacao', padrao: 'Alt+C' }
];

const ORDEM_MODIFICADORES = ['Ctrl', 'Alt', 'Shift'];
const SOMENTE_MODIFICADOR = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph']);

// Nome da tecla (sem modificadores) a partir do evento: letra/número pelo código físico (não muda com Alt/Option),
// senão pelo `key` (testes e teclados sem `code`).
export function nomeDaTecla(e) {
    if (!e) return '';
    const key0 = String(e.key ?? '');
    // Letra/número que o teclado realmente digita (vale em Dvorak, Colemak...); no Mac, Option troca o caractere, aí cai no código físico.
    if (/^[A-Za-z0-9]$/.test(key0)) return key0.toUpperCase();
    const code = String(e.code || '');
    if (code.startsWith('Key')) return code.slice(3).toUpperCase();
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad') && /^Numpad\d$/.test(code)) return code.slice(6);
    if (/^F\d{1,2}$/.test(code)) return code;
    const key = String(e.key ?? '');
    if (!key || SOMENTE_MODIFICADOR.has(key)) return '';
    if (key === ' ') return 'Espaço';
    return key.length === 1 ? key.toUpperCase() : key;
}

function modificadoresDoEvento(e) {
    const mods = [];
    if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    return mods;
}

// Transforma o evento de teclado no texto do atalho ("Ctrl+K"). Vazio se só apertou modificadores.
export function eventoParaAtalho(e) {
    const tecla = nomeDaTecla(e);
    if (!tecla) return '';
    return [...modificadoresDoEvento(e), tecla].join('+');
}

// Atalho de combinação precisa de Ctrl ou Alt (ou ser uma tecla F1-F12), senão atrapalharia a digitação.
export function atalhoValido(combo) {
    const partes = String(combo || '').split('+').filter(Boolean);
    if (partes.length < 2) return /^F\d{1,2}$/.test(partes[0] || '');
    const tecla = partes[partes.length - 1];
    const mods = partes.slice(0, -1);
    // Precisa de Ctrl ou Alt: Shift sozinho com uma letra é só digitação.
    return !!tecla && mods.every(m => ORDEM_MODIFICADORES.includes(m)) && (mods.includes('Ctrl') || mods.includes('Alt'));
}

// Modificador escolhido pra "ir para a aba N": uma ou mais teclas entre Ctrl, Alt e Shift (ex.: "Alt", "Ctrl+Shift").
export function modificadorValido(valor) {
    const partes = String(valor || '').split('+').filter(Boolean);
    return partes.length > 0 && partes.every(m => ORDEM_MODIFICADORES.includes(m)) && (partes.includes('Ctrl') || partes.includes('Alt'));
}

export function lerAtalhosSalvos(storage) {
    try {
        const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        const bruto = s ? JSON.parse(s.getItem(CHAVE_ATALHOS) || '{}') : {};
        return bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {};
    } catch (e) { return {}; }
}

// Atalho em vigor de uma ação: o escolhido (se válido) ou o padrão.
export function getAtalho(id, salvos) {
    const acao = ACOES_ATALHO.find(a => a.id === id);
    if (!acao) return '';
    const escolhido = (salvos || lerAtalhosSalvos())[id];
    if (typeof escolhido === 'string') {
        if (acao.tipo === 'modificador' ? modificadorValido(escolhido) : atalhoValido(escolhido)) return escolhido;
    }
    return acao.padrao;
}

export function getTodosAtalhos(salvos) {
    const base = salvos || lerAtalhosSalvos();
    return Object.fromEntries(ACOES_ATALHO.map(a => [a.id, getAtalho(a.id, base)]));
}

// Grava a escolha. Devolve { ok, motivo }: recusa atalho inválido ou que já é de outra ação.
export function salvarAtalho(id, combo, storage) {
    const acao = ACOES_ATALHO.find(a => a.id === id);
    if (!acao) return { ok: false, motivo: 'Ação desconhecida.' };
    const valido = acao.tipo === 'modificador' ? modificadorValido(combo) : atalhoValido(combo);
    if (!valido) return { ok: false, motivo: acao.tipo === 'modificador' ? 'Escolha um modificador com Ctrl ou Alt.' : 'Use Ctrl ou Alt junto com a tecla (Shift sozinho atrapalharia a digitação).' };
    const outra = acaoEmConflito(id, combo);
    if (outra) return { ok: false, motivo: `Esse atalho já é de "${outra.nome}".` };
    const salvos = { ...lerAtalhosSalvos(storage), [id]: combo };
    try { (storage || localStorage).setItem(CHAVE_ATALHOS, JSON.stringify(salvos)); } catch (e) { return { ok: false, motivo: 'Não foi possível salvar neste navegador.' }; }
    return { ok: true, motivo: '' };
}

export function restaurarAtalhos(storage) {
    try { (storage || localStorage).removeItem(CHAVE_ATALHOS); } catch (e) { /* sem storage */ }
}

// Outra ação que já usa esse atalho (considera "ir para a aba N" como modificador + 1..9).
export function acaoEmConflito(id, combo) {
    const atuais = getTodosAtalhos();
    const acaoPropria = ACOES_ATALHO.find(a => a.id === id);
    const conflitaCom = (outra) => {
        if (outra.id === id) return false;
        const valorOutra = atuais[outra.id];
        if (acaoPropria.tipo === outra.tipo) return valorOutra === combo;
        const [comMod, comCombo] = acaoPropria.tipo === 'modificador' ? [acaoPropria, outra] : [outra, acaoPropria];
        const mod = comMod.id === id ? combo : valorOutra;
        const cmb = comCombo.id === id ? combo : valorOutra;
        const partes = cmb.split('+');
        return /^[1-9]$/.test(partes[partes.length - 1]) && partes.slice(0, -1).join('+') === mod;
    };
    return ACOES_ATALHO.find(conflitaCom) || null;
}

// O evento é exatamente esse atalho de combinação?
export function eventoCombina(e, id, salvos) {
    const combo = getAtalho(id, salvos);
    return !!combo && eventoParaAtalho(e) === combo;
}

// "Ir para a aba N": devolve o dígito (1-9) se o evento é o modificador escolhido + um número, senão null.
export function digitoDaAba(e, salvos) {
    const mod = getAtalho('abas', salvos);
    // Só pelo código físico (Digit1..9): no Mac, Option+número troca o caractere de `key`.
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '');
    if (!m) return null;
    const tecla = m[1];
    const mods = modificadoresDoEvento(e).join('+');
    return mods === mod ? tecla : null;
}

// Texto bonito pro botão (Cmd aparece como Ctrl; o app trata os dois igual).
export function formatarAtalho(combo) {
    return String(combo || '').split('+').join(' + ');
}
