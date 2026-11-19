// ==========================================
// 🔁 REUTILIZAÇÃO DO GOLPE — lógica pura. Uma Habilidade/Poder pode ser usada de novo no MESMO golpe, sem pagar o custo outra vez:
//   reutilizacao: { porAlvos: { 1: 5, 2: 3, 3: 2 } }            acertou 1 alvo = 5 reusos; 2 alvos = 3; 3 alvos = 2 (vale a maior chave <= alvos atingidos)
//   reutilizacao: { chance: 50, max: 3, extra?: '50d4' }         cada reuso só acontece se passar numa chance de N% (rola em sequência;
//                                                                 a 1ª falha para tudo), até `max` reusos; `extra` = dado somado ao dano de CADA reuso
// Custo bruto no Poder (disputa) e custo total do golpe para Reflexo: nos reusos valem 0 (nada foi pago). "Primeiro ataque do turno" NÃO vale nos reusos (o contador já subiu no 1º golpe).
// Cada reuso é um golpe adicional (novo dano, novos estados, novo evento `acertou`), SEM custo de energia/Ação e sem contar de novo
// no "ataques do turno". Quem rola é components/combate/AtaqueFormContext.jsx > executarRolarDano (laço depois do 1º golpe).
// Tetos: LIMITE_REUSOS por golpe; o dado extra respeita o limite de dados por termo (core/danoDados.js) e LIMITE_DADOS_EXTRA_TOTAL somando todos
// os reusos (o dado por reuso encolhe até caber). Golpe que errou não chega aqui (sem dano rolado, sem reuso).
// ==========================================
import { lerDadoDeDano, formatarDadoDeDano } from './danoDados.js';

export const LIMITE_REUSOS = 20;
export const LIMITE_ALVOS_REUSO = 50;
export const LIMITE_FAIXAS_REUSO = 8;
export const LIMITE_DADOS_EXTRA_TOTAL = 5000;

const inteiro = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? Math.floor(n) : null; };

// Forma gravada ou null (sem reuso válido). porAlvos tem prioridade sobre chance quando vêm os dois. Nunca devolve `undefined`.
export function normalizarReutilizacao(bruta) {
    if (!bruta || typeof bruta !== 'object') return null;
    // ⚠️ O Firebase devolve objetos com chaves numéricas seguidas ("1","2","3") como ARRAY (com null na posição 0): os dois formatos valem.
    if (bruta.porAlvos && typeof bruta.porAlvos === 'object') {
        const faixas = {};
        let qtd = 0;
        Object.keys(bruta.porAlvos).forEach((k) => {
            const alvos = inteiro(k); const n = inteiro(bruta.porAlvos[k]);
            if (alvos === null || n === null || alvos < 1 || alvos > LIMITE_ALVOS_REUSO || n < 1 || qtd >= LIMITE_FAIXAS_REUSO) return;
            faixas[alvos] = Math.min(LIMITE_REUSOS, n);
            qtd++;
        });
        return qtd > 0 ? { porAlvos: faixas } : null;
    }
    const chance = typeof bruta.chance === 'number' ? bruta.chance : parseFloat(String(bruta.chance ?? '').replace(',', '.'));
    const max = inteiro(bruta.max);
    if (!Number.isFinite(chance) || chance <= 0 || max === null || max < 1) return null;
    const extra = bruta.extra === undefined || bruta.extra === null || bruta.extra === '' ? null : lerDadoDeDano(bruta.extra);
    if (bruta.extra !== undefined && bruta.extra !== null && bruta.extra !== '' && !extra) return null; // dado extra inválido: recusa o conjunto (nada de "meio reuso")
    return { chance: Math.min(100, Math.round(chance * 100) / 100), max: Math.min(LIMITE_REUSOS, max), ...(extra ? { extra: formatarDadoDeDano(extra) } : {}) };
}

// O Poder (ou Técnica) tem reuso válido?
export const reutilizacaoDe = (fonte) => normalizarReutilizacao(fonte && fonte.reutilizacao);

// Teto de escritas por golpe: alvos atingidos x golpes (o 1º + os reusos) não passam de LIMITE_DANOS_POR_GOLPE aplicações de dano.
export const LIMITE_DANOS_POR_GOLPE = 60;
export function limitarReusosPorAlvos(total, alvos) {
    const a = Math.max(1, Math.floor(Number(alvos) || 1));
    const max = Math.max(0, Math.floor(LIMITE_DANOS_POR_GOLPE / a) - 1);
    return Math.max(0, Math.min(Math.floor(Number(total) || 0), max));
}

// Primeira fonte do golpe com reuso válido: { fonte, reut } ou null. Só uma vale por golpe (a primeira da lista).
export function reutilizacaoDoGolpe(fontes) {
    for (const f of (Array.isArray(fontes) ? fontes : [])) {
        const reut = reutilizacaoDe(f);
        if (reut) return { fonte: f, reut };
    }
    return null;
}

// Quantos reusos esse golpe ganha. `alvosAtingidos` = alvos que o golpe acertou (0 = nenhum: sem reuso). `rng` injetável (0 a 1).
// Devolve { total, rolagens } (rolagens só no modo chance: [{ valor, passou }], uma por tentativa feita).
export function calcularReusos(reut, alvosAtingidos, rng = Math.random) {
    const r = normalizarReutilizacao(reut);
    const alvos = Math.max(0, Math.floor(Number(alvosAtingidos) || 0));
    if (!r || alvos < 1) return { total: 0, rolagens: [] };
    if (r.porAlvos) {
        const chaves = Object.keys(r.porAlvos).map(Number).filter(k => k <= alvos).sort((a, b) => b - a);
        return { total: chaves.length > 0 ? Math.min(LIMITE_REUSOS, r.porAlvos[chaves[0]]) : 0, rolagens: [] };
    }
    const rolagens = [];
    let total = 0;
    while (total < r.max) {
        const valor = Math.floor(rng() * 100) + 1;
        const passou = valor <= r.chance;
        rolagens.push({ valor, passou });
        if (!passou) break;
        total++;
    }
    return { total, rolagens };
}

// Dado extra de cada reuso (modo chance) já limitado para que todos os `total` reusos juntos não passem de LIMITE_DADOS_EXTRA_TOTAL dados.
// { qtd, faces, reduzido } ou null (sem extra ou sem espaço).
export function dadoExtraDoReuso(reut, total = 1) {
    const r = normalizarReutilizacao(reut);
    if (!r || !r.extra) return null;
    const d = lerDadoDeDano(r.extra);
    if (!d) return null;
    const n = Math.max(1, Math.floor(Number(total) || 1));
    const maxPorReuso = Math.floor(LIMITE_DADOS_EXTRA_TOTAL / n);
    if (maxPorReuso < 1) return null;
    const qtd = Math.min(d.qtd, maxPorReuso);
    return { qtd, faces: d.faces, reduzido: qtd < d.qtd };
}

// Frase para o cartão/feed. Ex.: "reusa 5x se acertar 1 alvo, 3x com 2 alvos" / "50% por reuso, até 3x (+50d4 em cada)".
export function descreverReutilizacao(reut) {
    const r = normalizarReutilizacao(reut);
    if (!r) return '';
    if (r.porAlvos) {
        const partes = Object.keys(r.porAlvos).map(Number).sort((a, b) => a - b).map(k => `${r.porAlvos[k]}x com ${k} alvo${k === 1 ? '' : 's'}`);
        return `reusa o golpe sem custo: ${partes.join(', ')}`;
    }
    return `reusa o golpe sem custo: ${r.chance}% por reuso, até ${r.max}x${r.extra ? ` (+${r.extra} em cada reuso)` : ''}`;
}

// Linha do feed do reuso: "🔁 Reuso 2/4" (porAlvos: total conhecido) ou "🔁 Reuso 2 (até 3, chance 50%)".
export function rotuloDoReuso(reut, indice, total) {
    const r = normalizarReutilizacao(reut);
    if (r && r.chance) return `🔁 Reuso ${indice}/${total} (chance ${r.chance}%, máx. ${r.max}), sem custo`;
    return `🔁 Reuso ${indice}/${total}, sem custo`;
}

// ---------- Formulário (editor do Poder) ----------

// Estado do editor: { modo: '' | 'porAlvos' | 'chance', a1, a2, a3 (reusos com 1, 2 e 3+ alvos), chance, max, extra } (tudo texto, como os outros campos do editor).
export const reutilizacaoFormVazio = () => ({ modo: '', a1: '', a2: '', a3: '', chance: '', max: '', extra: '' });

export function reutilizacaoParaForm(reut) {
    const r = normalizarReutilizacao(reut);
    const f = reutilizacaoFormVazio();
    if (!r) return f;
    if (r.porAlvos) {
        // O editor mostra 3 faixas (1, 2 e 3+ alvos); faixas acima de 3 (vindas de importação/Sexta-Feira) ficam guardadas em `extras` e voltam ao salvar.
        const extras = {};
        Object.keys(r.porAlvos).forEach((k) => { if (Number(k) > 3) extras[k] = r.porAlvos[k]; });
        return { ...f, modo: 'porAlvos', a1: String(r.porAlvos[1] ?? ''), a2: String(r.porAlvos[2] ?? ''), a3: String(r.porAlvos[3] ?? ''), extras };
    }
    return { ...f, modo: 'chance', chance: String(r.chance), max: String(r.max), extra: r.extra || '' };
}

// Do formulário para a forma gravada: { reut } ou { reut: null, erro } (campo inválido: o editor avisa em vez de salvar "meio reuso"). Modo vazio = sem reuso.
export function reutilizacaoDoForm(form) {
    const f = form && typeof form === 'object' ? form : {};
    if (f.modo === 'porAlvos') {
        const faixas = f.extras && typeof f.extras === 'object' ? { ...f.extras } : {};
        [['1', f.a1], ['2', f.a2], ['3', f.a3]].forEach(([alvos, n]) => { if (String(n ?? '').trim() !== '') faixas[alvos] = n; });
        const reut = normalizarReutilizacao({ porAlvos: faixas });
        return reut ? { reut } : { reut: null, erro: 'Reutilização por alvos: informe quantos reusos (1 a 20) para pelo menos uma faixa.' };
    }
    if (f.modo === 'chance') {
        const reut = normalizarReutilizacao({ chance: f.chance, max: f.max, ...(String(f.extra ?? '').trim() ? { extra: f.extra } : {}) });
        return reut ? { reut } : { reut: null, erro: 'Reutilização por chance: informe a chance (1 a 100), o máximo de reusos (1 a 20) e, se quiser, um dado extra válido (ex.: 5d4).' };
    }
    return { reut: null };
}
