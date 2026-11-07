// ==========================================
// 🔋 CUSTO POR TURNO ENQUANTO LIGADO — lógica pura. Um Poder pode cobrar energia a cada início de turno do dono enquanto
// está ligado ("5% de chakra por turno", "12 de mana por turno"):
//   custoPorTurno: { modo: 'fixo' | 'percMax', valor: N, energia: 'mana' | 'aura' | 'chakra' | 'corpo' }
// fixo = N na escala exibida (o valor guardado na ficha é N x FATOR_EXIBICAO_VITAIS); percMax = N% do máximo atual da energia.
// Sem energia suficiente o Poder desliga (mesmo caminho do togglePoder: os máximos voltam e os vitais mantêm a mesma %),
// sem pagar nada e SEM disparar o "ao desligar" (core/aoDesligar.js), que é só do desligar manual.
// ==========================================
import { removerEscudosDoPoder } from './escudos.js';
import { FATOR_EXIBICAO_VITAIS, getTetoExibidoComFator, capturarMaximosAtuais, rescalarVitaisProporcional } from './vitals.js';

export const ENERGIAS_CUSTO = ['mana', 'aura', 'chakra', 'corpo'];
export const MODOS_CUSTO = ['fixo', 'percMax'];
export const LIMITE_CUSTO_POR_TURNO = 1e12;
const LIMITE_PERCENTUAL = 100;

// Lê e valida o custo de um Poder. { custo, aviso }: custo = objeto limpo ou null (sem custo / inválido); aviso só se o dado veio inválido.
export function lerCustoPorTurno(bruto) {
    if (bruto === undefined || bruto === null || bruto === '') return { custo: null, aviso: '' };
    if (typeof bruto !== 'object' || Array.isArray(bruto)) return { custo: null, aviso: 'Custo por turno ignorado: formato inválido.' };
    const valor = parseFloat(String(bruto.valor ?? '').replace(',', '.'));
    if (bruto.valor === undefined || bruto.valor === null || bruto.valor === '' || valor === 0) return { custo: null, aviso: '' };
    if (!Number.isFinite(valor) || valor < 0 || valor > LIMITE_CUSTO_POR_TURNO) return { custo: null, aviso: 'Custo por turno ignorado: valor inválido.' };
    if (!MODOS_CUSTO.includes(bruto.modo)) return { custo: null, aviso: `Custo por turno ignorado: modo "${bruto.modo ?? ''}" inválido (use fixo ou percMax).` };
    if (!ENERGIAS_CUSTO.includes(bruto.energia)) return { custo: null, aviso: `Custo por turno ignorado: energia "${bruto.energia ?? ''}" inválida.` };
    if (bruto.modo === 'percMax' && valor > LIMITE_PERCENTUAL) return { custo: null, aviso: 'Custo por turno ignorado: a porcentagem passa de 100.' };
    return { custo: { modo: bruto.modo, valor, energia: bruto.energia }, aviso: '' };
}

export const normalizarCustoPorTurno = (bruto) => lerCustoPorTurno(bruto).custo;

// "5% de chakra por turno" / "12 de mana por turno". Vazio sem custo.
export function descreverCustoPorTurno(poder) {
    const c = normalizarCustoPorTurno(poder && poder.custoPorTurno);
    if (!c) return '';
    const n = c.valor.toLocaleString('pt-BR');
    return c.modo === 'percMax' ? `${n}% de ${c.energia} por turno` : `${n} de ${c.energia} por turno`;
}

const exibido = (bruto) => Math.floor(bruto / FATOR_EXIBICAO_VITAIS);

// Calcula (sem mexer na ficha) o que cada Poder LIGADO com custo pagaria agora. Vários Poderes na mesma energia pagam em sequência.
// Devolve { gastos: [{ id, nome, energia, bruto, valor }], desligar: [{ id, nome, energia }] }.
export function calcularCustosPorTurno(ficha) {
    const gastos = [];
    const desligar = [];
    if (!ficha || !Array.isArray(ficha.poderes)) return { gastos, desligar };
    const saldo = {};
    const tetos = {};
    ficha.poderes.forEach((p) => {
        if (!p || !p.ativa) return;
        const c = normalizarCustoPorTurno(p.custoPorTurno);
        if (!c) return;
        const reg = ficha[c.energia];
        if (saldo[c.energia] === undefined) saldo[c.energia] = Math.max(0, Number(reg && reg.atual) || 0);
        let bruto = 0;
        if (c.modo === 'fixo') bruto = c.valor * FATOR_EXIBICAO_VITAIS;
        else {
            if (tetos[c.energia] === undefined) {
                try { tetos[c.energia] = Number(getTetoExibidoComFator(c.energia, ficha)) || 0; } catch (e) { tetos[c.energia] = 0; }
            }
            bruto = tetos[c.energia] * (c.valor / 100);
        }
        if (!Number.isFinite(bruto)) bruto = Number.MAX_VALUE;
        if (!reg || saldo[c.energia] < bruto) { desligar.push({ id: p.id, nome: p.nome, energia: c.energia }); return; }
        saldo[c.energia] -= bruto;
        gastos.push({ id: p.id, nome: p.nome, energia: c.energia, bruto, valor: exibido(bruto) });
    });
    return { gastos, desligar };
}

// Desliga um Poder NO RASCUNHO pelo mesmo caminho do togglePoder (captura máximos -> desliga -> mantém a % dos vitais).
export function desligarPoderNoRascunho(ficha, id) {
    const p = (ficha.poderes || []).find(po => po && po.id === id);
    if (!p || !p.ativa) return false;
    const antes = capturarMaximosAtuais(ficha);
    p.ativa = false;
    rescalarVitaisProporcional(ficha, antes);
    // 🛡️ O escudo que o Poder criou ao ligar (escudoAoLigar) some junto.
    removerEscudosDoPoder(ficha, p.id);
    return true;
}

// Instantâneo do que o turno pode mexer em cada Poder (por id), para comparar antes/depois.
export function fotoDosPoderes(ficha) {
    const foto = {};
    (Array.isArray(ficha && ficha.poderes) ? ficha.poderes : []).forEach((p) => { if (p && p.id !== undefined) foto[p.id] = { ativa: !!p.ativa, recargaRestante: p.recargaRestante }; });
    return foto;
}

// Caminhos do Firebase SÓ dos campos que mudaram (poderes/{i}/ativa, poderes/{i}/recargaRestante; null apaga). O índice vem de
// `poderesFrescos` (a lista mais recente que se tem), achado pelo id, e não da lista do rascunho: nunca regrava o array.
export function camposDePoderesAlterados(antes, depois, poderesFrescos) {
    const campos = {};
    const lista = Array.isArray(poderesFrescos) ? poderesFrescos : [];
    Object.keys(depois || {}).forEach((chave) => {
        const a = (antes || {})[chave]; const d = depois[chave];
        if (!a) return;
        const i = lista.findIndex(p => p && String(p.id) === chave);
        if (i < 0) return;
        if (a.ativa !== d.ativa) campos[`poderes/${i}/ativa`] = d.ativa;
        if (a.recargaRestante !== d.recargaRestante) campos[`poderes/${i}/recargaRestante`] = d.recargaRestante === undefined ? null : d.recargaRestante;
    });
    return campos;
}

// Aplica o custo do turno no rascunho da ficha (use dentro de updateFicha ou numa cópia). Devolve { alterou, textos } com o texto do feed.
export function aplicarCustosPorTurno(ficha) {
    const { gastos, desligar } = calcularCustosPorTurno(ficha);
    const textos = [];
    let desligados = 0;
    gastos.forEach((g) => {
        ficha[g.energia].atual = Math.max(0, (Number(ficha[g.energia].atual) || 0) - g.bruto);
        textos.push(`${g.nome} consumiu ${g.valor.toLocaleString('pt-BR')} de ${g.energia}`);
    });
    desligar.forEach((d) => {
        if (desligarPoderNoRascunho(ficha, d.id)) desligados++, textos.push(`${d.nome} desligou: sem ${d.energia} para o custo por turno`);
    });
    return { alterou: gastos.length > 0 || desligar.length > 0, textos, desligados };
}
