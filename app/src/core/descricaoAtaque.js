// ==========================================
// 📖 DESCRIÇÃO DO ATAQUE — como o golpe é executado, em texto. Lógica pura.
// Cada técnica (Habilidade/Forma/Poder, Técnica Elemental) e cada arma pode ter UMA OU MAIS descrições escritas pelo jogador
// ("Como executo este ataque"). Na hora do golpe o app escolhe uma (sorteia, se houver várias), troca os marcadores e acrescenta
// um complemento automático com o que estava ativo: Formas/Poderes ligados, elemento, energia e crítico — pra o jogador e o Mestre
// narrarem o que aconteceu. O texto vai junto com o Dano no feed.
// Marcadores aceitos nas descrições: {atacante} {alvo} {arma} {tecnica} {elemento}
// ==========================================
import { rotuloEnergia } from './identificacao.js';

export const MARCADORES_DESCRICAO = ['{atacante}', '{alvo}', '{arma}', '{tecnica}', '{elemento}'];
export const MAX_DESCRICOES_POR_ITEM = 8;
export const MAX_CARACTERES_DESCRICAO = 600;
const MAX_ATIVOS_NO_COMPLEMENTO = 5;
export const MAX_CARACTERES_NARRATIVA = 1500;

let contador = 0;
export function novoIdDescricao() {
    contador += 1;
    return `${Date.now().toString(36)}${contador}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function novaDescricao(texto = '') {
    return { id: novoIdDescricao(), texto: String(texto).slice(0, MAX_CARACTERES_DESCRICAO) };
}

// Lista saneada: só objetos com texto, no máximo MAX_DESCRICOES_POR_ITEM. Mantém textos em branco se `manterVazias` (edição).
export function normalizarDescricoes(lista, manterVazias = false) {
    if (!Array.isArray(lista)) return [];
    const limpas = lista
        .filter(d => d && typeof d === 'object')
        .map(d => ({ id: d.id || novoIdDescricao(), texto: String(d.texto ?? '').slice(0, MAX_CARACTERES_DESCRICAO) }))
        .filter(d => manterVazias || d.texto.trim() !== '');
    return limpas.slice(0, MAX_DESCRICOES_POR_ITEM);
}

// Escolhe uma descrição (sorteia entre as preenchidas). `aleatorio` é injetável pra teste (0 <= n < 1).
export function escolherDescricao(lista, aleatorio = Math.random) {
    const validas = normalizarDescricoes(lista);
    if (validas.length === 0) return null;
    const i = Math.min(validas.length - 1, Math.floor(Math.max(0, Math.min(0.999999, aleatorio())) * validas.length));
    return validas[i].texto.trim();
}

// Troca os marcadores. Sem o dado, usa uma palavra neutra pra frase continuar fazendo sentido.
export function aplicarMarcadores(texto, ctx = {}) {
    const trocas = {
        '{atacante}': ctx.atacante || 'o atacante',
        '{alvo}': ctx.alvo || 'o alvo',
        '{arma}': ctx.arma || 'sua arma',
        '{tecnica}': ctx.tecnica || 'a técnica',
        '{elemento}': ctx.elemento || 'a energia'
    };
    let saida = String(texto || '');
    Object.entries(trocas).forEach(([k, v]) => { saida = saida.split(k).join(v); });
    return saida;
}

function nomesUnicos(lista, max) {
    const vistos = new Set();
    const nomes = [];
    (lista || []).forEach(x => {
        const n = String(x && x.nome ? x.nome : '').trim();
        if (n && !vistos.has(n)) { vistos.add(n); nomes.push(n); }
    });
    return { nomes: nomes.slice(0, max), extras: Math.max(0, nomes.length - max) };
}

// Complemento automático: o que estava ativo no golpe. Devolve '' se não há nada a acrescentar.
export function montarComplemento({ ativos, elemento, energias, critico } = {}) {
    const partes = [];
    const { nomes, extras } = nomesUnicos(ativos, MAX_ATIVOS_NO_COMPLEMENTO);
    if (nomes.length > 0) partes.push(`Ativos: ${nomes.join(', ')}${extras > 0 ? ` e mais ${extras}` : ''}`);
    const elem = String(elemento || '').trim();
    if (elem && !['fisico', 'físico', 'neutro', 'nenhum'].includes(elem.toLowerCase())) partes.push(`Elemento: ${elem.charAt(0).toUpperCase() + elem.slice(1)}`);
    if (Array.isArray(energias) && energias.length > 0) partes.push(`Energia: ${energias.map(rotuloEnergia).join(' + ')}`);
    if (critico === 'fatal') partes.push('Crítico Fatal!');
    else if (critico === 'critico') partes.push('Crítico!');
    return partes.join(' · ');
}

// Monta a narrativa do golpe. `fontes` = [{ nome, tipo?, descricoes }] (arma e técnicas usadas); cada fonte com descrição contribui
// com UMA frase. Devolve { texto, complemento } ou null quando nenhuma fonte tem descrição (nada a narrar).
export function montarNarrativa({ atacante, alvo, fontes, ativos, elemento, energias, critico, aleatorio } = {}) {
    const frases = [];
    (fontes || []).forEach(f => {
        if (!f) return;
        const base = escolherDescricao(f.descricoes, aleatorio);
        if (!base) return;
        const ehArma = f.tipo === 'arma';
        const frase = aplicarMarcadores(base, { atacante, alvo, arma: ehArma ? f.nome : undefined, tecnica: f.nome, elemento });
        frases.push(/[.!?…]$/.test(frase) ? frase : `${frase}.`);
    });
    if (frases.length === 0) return null;
    const texto = frases.join(' ');
    return { texto: texto.length > MAX_CARACTERES_NARRATIVA ? texto.slice(0, MAX_CARACTERES_NARRATIVA - 1) + '…' : texto, complemento: montarComplemento({ ativos, elemento, energias, critico }) };
}
