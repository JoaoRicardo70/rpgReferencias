// ==========================================
// 💚 AO ACERTAR — lógica pura. Uma Habilidade/Poder/Técnica pode declarar o que acontece com QUEM ACERTOU quando o golpe atinge
// um alvo e causa Dano: curar a si mesmo ou restaurar uma energia, em valor fixo, % do atual ou % do máximo.
//   aoAcertar: [{ tipo: 'curarAtacante' | 'energiaAtacante', modo: 'fixo' | 'percAtual' | 'percMax', valor, energia?, apenasCritico? }]
// Vale UMA vez por golpe (mesmo em área) e só se algum alvo sofreu Dano. Valor fixo é na escala exibida (como o Dano); o armazenado é
// bruto (core/vitals.js > FATOR_EXIBICAO_VITAIS). Cura e restauração nunca passam do máximo nem diminuem o que já está acima dele.
// ==========================================
import { danoExibidoParaBruto, FATOR_EXIBICAO_VITAIS, getTetoExibidoComFator } from './vitals.js';
import { calcularEficaciaCura } from './engine.js';
import { getVidaMaxBrutaNpc } from './gavetaNpc.js';

export const LIMITE_AO_ACERTAR = 6;

export const TIPOS_AO_ACERTAR = [
    { id: 'curarAtacante', rotulo: '💚 Cura quem acertou (Vida)' },
    { id: 'energiaAtacante', rotulo: '🔋 Restaura energia de quem acertou' },
];
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

// Lista limpa (tipo e modo válidos, valor > 0 dentro dos limites, no máximo LIMITE_AO_ACERTAR); o que for inválido é descartado.
export function normalizarAoAcertar(lista) {
    const saida = [];
    (Array.isArray(lista) ? lista : []).forEach((e) => {
        if (!e || typeof e !== 'object' || saida.length >= LIMITE_AO_ACERTAR) return;
        if (!IDS_TIPO.has(e.tipo)) return;
        const modo = IDS_MODO.has(e.modo) ? e.modo : 'fixo';
        const bruto = parseFloat(String(e.valor ?? '').replace(',', '.'));
        if (!Number.isFinite(bruto) || bruto <= 0) return;
        const valor = Math.min(modo === 'fixo' ? MAX_FIXO : MAX_PERCENTUAL, bruto);
        const item = { tipo: e.tipo, modo, valor };
        if (e.tipo === 'energiaAtacante') item.energia = ENERGIAS_AO_ACERTAR.includes(e.energia) ? e.energia : 'mana';
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
