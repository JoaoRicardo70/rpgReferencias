// ==========================================
// 💚 AO ACERTAR — lógica pura. Uma Habilidade/Poder/Técnica pode declarar o que acontece com QUEM ACERTOU quando o golpe atinge
// um alvo e causa Dano:
//   em quem acertou — curar a Vida (curarAtacante) ou restaurar uma energia (energiaAtacante), em valor fixo, % do atual ou % do máximo;
//   no alvo (só personagens com ficha) — drenar a energia dele (drenarEnergiaAlvo; com `roubar`, quem acertou ganha exatamente o que saiu do alvo)
//   ou enfraquecê-lo (debuffAlvo: -N de Evasiva/Resistência/Acerto/CD por alguns turnos dele, como um buff temporário negativo do Suporte;
//   com `empilha` acumula a cada golpe, até `maximo` se houver: ex. -5 por uso até -15).
//   aoAcertar: [{ tipo, modo: 'fixo' | 'percAtual' | 'percMax', valor, energia?, atributo?, duracao?, empilha?, maximo?, roubar?, apenasCritico? }]
// Em quem acertou vale UMA vez por golpe (mesmo em área) e só se algum alvo sofreu Dano; no alvo, em CADA alvo atingido que sofreu Dano. Valor fixo é na escala exibida (como o Dano); o armazenado é
// bruto (core/vitals.js > FATOR_EXIBICAO_VITAIS). Cura e restauração nunca passam do máximo nem diminuem o que já está acima dele.
// ==========================================
import { danoExibidoParaBruto, FATOR_EXIBICAO_VITAIS, getTetoExibidoComFator } from './vitals.js';
import { calcularEficaciaCura } from './engine.js';
import { getVidaMaxBrutaNpc } from './gavetaNpc.js';
import { efeitosDeBuffsTemporarios, somarBuffTemporario, NOME_BUFF_CURA_REDUZIDA, PROPRIEDADE_CURA_REDUZIDA, fatorDeBuffCura, menorFatorCuraReduzida } from './suporte.js';

export const LIMITE_AO_ACERTAR = 6;

export const TIPOS_AO_ACERTAR = [
    { id: 'curarAtacante', rotulo: '💚 Cura quem acertou (Vida)' },
    { id: 'energiaAtacante', rotulo: '🔋 Restaura energia de quem acertou' },
    { id: 'drenarEnergiaAlvo', rotulo: '🕳️ Drena energia do alvo' },
    { id: 'debuffAlvo', rotulo: '⬇️ Enfraquece o alvo (CA/Acerto)' },
    { id: 'reduzirCuraAlvo', rotulo: '🩹 Reduz a cura do alvo' },
];
// Tipos que mexem no ALVO (só personagens com ficha; entidades do Mapa não têm ficha).
export const TIPOS_NO_ALVO = ['drenarEnergiaAlvo', 'debuffAlvo', 'reduzirCuraAlvo'];
// Cura reduzida: fator da eficácia de cura do alvo (0.5 = metade). Limites do fator.
export const FATOR_CURA_MIN = 0.01;
export const FATOR_CURA_MAX = 1;
// Atributos que o debuff pode reduzir (todos lidos como bônus BASE na CA/Acerto) e a duração máxima, em turnos do alvo.
// 'resistencia' é o "save"/CA de Resistência; 'cd' é a CD das habilidades do alvo (lida por bonusBuffTemporario, ver abaixo).
export const ATRIBUTOS_DEBUFF_AO_ACERTAR = ['evasiva', 'resistencia', 'acerto', 'cd'];
const ROTULO_ATRIBUTO_DEBUFF = { evasiva: 'Evasiva', resistencia: 'Resistência', acerto: 'Acerto', cd: 'CD' };
export const LIMITE_DURACAO_DEBUFF = 20;
export const MODOS_AO_ACERTAR = [
    { id: 'fixo', rotulo: 'valor fixo' },
    { id: 'percAtual', rotulo: '% do valor atual' },
    { id: 'percMax', rotulo: '% do máximo' },
];
export const ENERGIAS_AO_ACERTAR = ['mana', 'aura', 'chakra', 'corpo'];

const IDS_TIPO = new Set(TIPOS_AO_ACERTAR.map(t => t.id));
const IDS_MODO = new Set(MODOS_AO_ACERTAR.map(m => m.id));
const MAX_FIXO = 1e15;
const MAX_PERCENTUAL = 1000;

// Fator de cura: número 0.01..1, ou texto "1/2", "50%", "0,5". Inválido (ou fora do intervalo) = null.
export function lerFatorCura(v) {
    let n;
    if (typeof v === 'number') n = v;
    else {
        const t = String(v ?? '').trim().replace(',', '.');
        const frac = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(t);
        if (frac) n = parseFloat(frac[1]) / parseFloat(frac[2]);
        else if (t.endsWith('%')) n = parseFloat(t) / 100;
        else n = parseFloat(t);
    }
    if (!Number.isFinite(n) || n < FATOR_CURA_MIN || n > FATOR_CURA_MAX) return null;
    return n;
}

function normalizarReduzirCura(e) {
    const fator = lerFatorCura(e.fator);
    if (fator === null) return null;
    const dur = Math.floor(Number(e.duracao));
    // `valor` espelha o fator só para o item passar pelos mesmos filtros (valor > 0) dos outros tipos.
    const item = { tipo: 'reduzirCuraAlvo', modo: 'fixo', valor: fator, fator, duracao: Number.isFinite(dur) ? Math.max(1, Math.min(LIMITE_DURACAO_DEBUFF, dur)) : 1 };
    if (e.apenasCritico) item.apenasCritico = true;
    return item;
}

// Lista limpa (tipo e modo válidos, valor > 0 dentro dos limites, no máximo LIMITE_AO_ACERTAR); o que for inválido é descartado.
export function normalizarAoAcertar(lista) {
    const saida = [];
    (Array.isArray(lista) ? lista : []).forEach((e) => {
        if (!e || typeof e !== 'object' || saida.length >= LIMITE_AO_ACERTAR) return;
        if (!IDS_TIPO.has(e.tipo)) return;
        const modo = IDS_MODO.has(e.modo) ? e.modo : 'fixo';
        if (e.tipo === 'reduzirCuraAlvo') { const r = normalizarReduzirCura(e); if (r) saida.push(r); return; }
        const bruto = parseFloat(String(e.valor ?? '').replace(',', '.'));
        if (!Number.isFinite(bruto) || bruto <= 0) return;
        const valor = Math.min(modo === 'fixo' ? MAX_FIXO : MAX_PERCENTUAL, bruto);
        const item = { tipo: e.tipo, modo, valor };
        if (e.tipo === 'energiaAtacante' || e.tipo === 'drenarEnergiaAlvo') item.energia = ENERGIAS_AO_ACERTAR.includes(e.energia) ? e.energia : 'mana';
        // 🕳️ roubar: quem acertou recebe o que de fato saiu do alvo (sem `roubar`, dreno e ganho são independentes, como sempre).
        if (e.tipo === 'drenarEnergiaAlvo' && e.roubar) item.roubar = true;
        if (e.tipo === 'debuffAlvo') {
            // O valor é o tamanho da redução (em pontos); o modo não se aplica.
            item.modo = 'fixo';
            item.valor = Math.min(MAX_PERCENTUAL, bruto);
            item.atributo = ATRIBUTOS_DEBUFF_AO_ACERTAR.includes(e.atributo) ? e.atributo : 'evasiva';
            const dur = Math.floor(Number(e.duracao));
            item.duracao = Number.isFinite(dur) ? Math.max(1, Math.min(LIMITE_DURACAO_DEBUFF, dur)) : 3;
            if (e.empilha) item.empilha = true;
            // Teto do acúmulo (em pontos): só vale com `empilha`; sem ele, comportamento antigo (sem limite).
            const teto = parseFloat(String(e.maximo ?? '').replace(',', '.'));
            if (e.empilha && Number.isFinite(teto) && teto > 0) item.maximo = Math.min(MAX_PERCENTUAL, teto);
        }
        if (e.apenasCritico) item.apenasCritico = true;
        saida.push(item);
    });
    return saida;
}

// Junta o que os golpes em uso declaram: `fontes` = Poderes/Técnicas/Itens em uso ({ nome, aoAcertar }). Cada entrada leva a origem.
export function coletarAoAcertar({ fontes = [] } = {}) {
    const saida = [];
    fontes.forEach((f) => {
        if (!f) return;
        normalizarAoAcertar(f.aoAcertar).forEach(e => { if (saida.length < LIMITE_AO_ACERTAR * 3) saida.push({ ...e, origem: f.nome || '' }); });
    });
    return saida;
}

const fmtPerc = (f) => Math.round(f * 1000) / 10;

// Ganho na escala exibida: inteiro quando >= 1, senão com até 2 casas (nunca '+0').
const fmt = (n) => (n >= 1 ? Math.floor(n).toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));

function ganhoBruto(entrada, atual, max) {
    if (entrada.modo === 'fixo') return danoExibidoParaBruto(entrada.valor);
    if (entrada.modo === 'percAtual') return (atual * entrada.valor) / 100;
    return (max * entrada.valor) / 100;
}

// Aplica NO RASCUNHO da ficha (use dentro de updateFicha). Devolve as frases para o feed. Nada muda sem Vida/energia válida.
export function aplicarAoAcertarNoRascunho(ficha, entradas, { critico = false } = {}) {
    const textos = [];
    if (!ficha) return textos;
    (Array.isArray(entradas) ? entradas : []).forEach((e) => {
        if (!e || (e.apenasCritico && !critico)) return;
        const quem = e.origem ? `${e.origem}: ` : '';
        if (e.tipo === 'curarAtacante') {
            if (!ficha.vida) return;
            const atual = Number(ficha.vida.atual) || 0;
            const max = getVidaMaxBrutaNpc(ficha);
            if (!(max > 0)) return;
            const ganho = ganhoBruto(e, atual, max) * calcularEficaciaCura(ficha);
            const novo = Math.max(atual, Math.min(max, atual + ganho));
            if (novo <= atual) return;
            ficha.vida.atual = novo;
            textos.push(`💚 ${quem}+${fmt((novo - atual) / FATOR_EXIBICAO_VITAIS)} de Vida`);
        } else if (e.tipo === 'energiaAtacante') {
            const k = e.energia;
            if (!k || !ficha[k]) return;
            const atual = Number(ficha[k].atual) || 0;
            const max = getTetoExibidoComFator(k, ficha);
            if (!(max > 0)) return;
            const novo = Math.max(atual, Math.min(max, atual + ganhoBruto(e, atual, max)));
            if (novo <= atual) return;
            ficha[k].atual = novo;
            textos.push(`🔋 ${quem}+${fmt((novo - atual) / FATOR_EXIBICAO_VITAIS)} de ${k}`);
        }
    });
    return textos;
}

// ---------- No ALVO ----------

// Entre as entradas, as que mexem no alvo (vale também para decidir se há algo a dizer sobre entidades sem ficha).
export const entradasNoAlvo = (entradas) => (Array.isArray(entradas) ? entradas : []).filter(e => e && TIPOS_NO_ALVO.includes(e.tipo));

// Calcula o que gravar na ficha do alvo-personagem (sem alterar nada): { campos, buffs, textos }.
//   campos — mudanças por caminho para salvarCamposPersonagem, ex.: { 'mana/atual': 1234 };
//   buffs  — a lista NOVA de buffsTemporarios do alvo (ou null se nada mudou).
// O dreno nunca leva a energia abaixo de 0. O debuff é um buff temporário de valor NEGATIVO (core/suporte.js): vale por turnos do alvo e
// sai sozinho; "empilha" dá um buff novo a cada golpe (até o limite de buffs da ficha), sem isso o mesmo debuff só renova o prazo.
export function resolverAoAcertarNoAlvo(entradas, fichaAlvo, { critico = false, nomeAtacante = '', agora = Date.now() } = {}) {
    const resultado = { campos: {}, buffs: null, textos: [] }; // + roubado: { energia: bruto } só quando um dreno 'roubar' tirou algo
    if (!fichaAlvo) return resultado;
    let lista = Array.isArray(fichaAlvo.buffsTemporarios) ? fichaAlvo.buffsTemporarios : [];
    let n = 0;
    entradasNoAlvo(entradas).forEach((e) => {
        if (e.apenasCritico && !critico) return;
        const quem = e.origem ? `${e.origem}: ` : '';
        if (e.tipo === 'drenarEnergiaAlvo') {
            const k = e.energia;
            if (!k || !fichaAlvo[k]) return;
            // Vários drenos no mesmo golpe somam em sequência (usa o valor já reduzido).
            const atual = Number.isFinite(resultado.campos[`${k}/atual`]) ? resultado.campos[`${k}/atual`] : (Number(fichaAlvo[k].atual) || 0);
            const max = getTetoExibidoComFator(k, fichaAlvo);
            const tirar = ganhoBruto(e, atual, max);
            const novo = Math.max(0, atual - tirar);
            if (novo >= atual) return;
            resultado.campos[`${k}/atual`] = novo;
            // O que de fato saiu (já limitado ao que o alvo tinha): é isso que `roubar` entrega a quem acertou.
            if (e.roubar) { resultado.roubado = resultado.roubado || {}; resultado.roubado[k] = (resultado.roubado[k] || 0) + (atual - novo); }
            resultado.textos.push(`🕳️ ${quem}-${fmt((atual - novo) / FATOR_EXIBICAO_VITAIS)} de ${k} do alvo`);
        } else if (e.tipo === 'debuffAlvo') {
            const atributo = ATRIBUTOS_DEBUFF_AO_ACERTAR.includes(e.atributo) ? e.atributo : 'evasiva';
            const rotulo = ROTULO_ATRIBUTO_DEBUFF[atributo];
            const fonteBuff = nomeAtacante || e.origem || 'Ao acertar';
            const prefixo = `Enfraquecido (${rotulo})`;
            // Os buffs expiram em ordem: o próximo número é o MAIOR #n vivo + 1 (contar quantos existem repetiria um nome vivo e só renovaria).
            const maiorN = lista.filter(b => b && String(b.fonte) === String(fonteBuff) && String(b.nome).startsWith(prefixo))
                .reduce((m, b) => { const mm = /#(\d+)$/.exec(String(b.nome)); return Math.max(m, mm ? parseInt(mm[1], 10) : 0); }, 0);
            // Teto (maximo, só com empilha): regra por ATACANTE + ATRIBUTO. Soma só os stacks empilháveis (nome terminando em #n) que este atacante
            // já pôs neste atributo no alvo (o debuff sem #n não conta) e só aplica o que cabe. Obs.: buffsAtivosPorFicha (suporte.js) corta a lista
            // da ficha; se o alvo estiver no limite de buffs, stacks antigos podem sair e o acumulado contado fica menor.
            let aplicar = e.valor;
            if (e.empilha && Number.isFinite(e.maximo) && e.maximo > 0) {
                const acumulado = lista.filter(b => b && String(b.fonte) === String(fonteBuff) && String(b.nome).startsWith(prefixo) && /#\d+$/.test(String(b.nome)))
                    .reduce((t, b) => t + (Array.isArray(b.efeitos) ? b.efeitos.reduce((x, ef) => x + Math.max(0, -(Number(ef && ef.valor) || 0)), 0) : 0), 0);
                aplicar = Math.min(e.valor, e.maximo - acumulado);
                if (!(aplicar > 0)) { resultado.textos.push(`⬇️ ${quem}${rotulo} do alvo já está no teto (-${e.maximo})`); return; }
            }
            const nome = e.empilha ? `${prefixo} #${maiorN + 1}` : prefixo;
            lista = somarBuffTemporario(lista, {
                id: `ao_${agora}_${n++}`, nome, fonte: fonteBuff,
                efeitos: [{ nome, atributo, propriedade: 'base', valor: -aplicar }], duracao: e.duracao, duracaoModo: 'turnos'
            });
            resultado.buffs = lista;
            resultado.textos.push(`⬇️ ${quem}-${aplicar} de ${rotulo} por ${e.duracao} turno(s) do alvo`);
        } else if (e.tipo === 'reduzirCuraAlvo') {
            const fator = lerFatorCura(e.fator);
            if (fator === null) return;
            const fonteBuff = nomeAtacante || e.origem || 'Ao acertar';
            // Um único buff por alvo e fonte (nome fixo): golpes seguidos só renovam o prazo. O fator vigente é o MENOR entre o que já está
            // lá e o novo (cura reduzida nunca "afrouxa" por um golpe mais fraco); fatores não se multiplicam.
            const existente = lista.find(b => b && String(b.fonte) === String(fonteBuff) && b.nome === NOME_BUFF_CURA_REDUZIDA);
            const fatorAnterior = existente ? fatorDeBuffCura(existente) : null;
            const fatorFinal = fatorAnterior !== null ? Math.min(fatorAnterior, fator) : fator;
            lista = somarBuffTemporario(lista, {
                id: `ao_${agora}_${n++}`, nome: NOME_BUFF_CURA_REDUZIDA, fonte: fonteBuff,
                efeitos: [{ nome: NOME_BUFF_CURA_REDUZIDA, atributo: 'cura', propriedade: PROPRIEDADE_CURA_REDUZIDA, valor: fatorFinal }], duracao: e.duracao, duracaoModo: 'turnos'
            });
            resultado.buffs = lista;
            resultado.textos.push(`🩹 ${quem}cura do alvo reduzida a ${fmtPerc(menorFatorCuraReduzida({ buffsTemporarios: lista }))}% por ${e.duracao} turno(s)`);
        }
    });
    return resultado;
}

// ---------- Roubar (dreno ligado ao ganho) ----------

// Soma, na ficha de quem acertou, o que o dreno 'roubar' tirou dos alvos: `roubado` = { energia: bruto } (resolverAoAcertarNoAlvo).
// Nunca passa do máximo nem diminui o que já está acima dele. Use dentro de updateFicha. Devolve as frases para o feed.
export function aplicarRoubadoNoRascunho(ficha, roubado) {
    const textos = [];
    if (!ficha || !roubado) return textos;
    Object.keys(roubado).forEach((k) => {
        if (!ENERGIAS_AO_ACERTAR.includes(k) || !ficha[k]) return;
        const quanto = Number(roubado[k]);
        if (!(quanto > 0)) return;
        const atual = Number(ficha[k].atual) || 0;
        const max = getTetoExibidoComFator(k, ficha);
        if (!(max > 0)) return;
        const novo = Math.max(atual, Math.min(max, atual + quanto));
        if (novo <= atual) return;
        ficha[k].atual = novo;
        textos.push(`🕳️ roubou +${fmt((novo - atual) / FATOR_EXIBICAO_VITAIS)} de ${k}`);
    });
    return textos;
}

// Soma dos buffs temporários de um atributo "solto" (ex.: 'cd') na ficha: use para somar o debuff de CD na CD exibida.
export function bonusBuffTemporario(ficha, atributo) {
    return efeitosDeBuffsTemporarios(ficha)
        .filter(e => e && e.atributo === atributo && e.propriedade === 'base')
        .reduce((t, e) => t + (Number(e.valor) || 0), 0);
}
