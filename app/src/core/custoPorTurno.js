// ==========================================
// 🔋 CUSTO POR TURNO ENQUANTO LIGADO — lógica pura. Um Poder pode cobrar energia a cada início de turno do dono enquanto
// está ligado ("5% de chakra por turno", "12 de mana por turno"):
//   custoPorTurno: { modo: 'fixo' | 'percMax', valor: N, energia: 'mana' | 'aura' | 'chakra' | 'corpo' }  (ou uma LISTA desses, ex.: 10% de corpo e 10% de aura)
// fixo = N na escala exibida (o valor guardado na ficha é N x FATOR_EXIBICAO_VITAIS); percMax = N% do máximo atual da energia.
// Sem energia suficiente o Poder desliga (mesmo caminho do togglePoder: os máximos voltam e os vitais mantêm a mesma %),
// sem pagar nada (com vários custos, se faltar em qualquer energia nenhuma é paga) e SEM disparar o "ao desligar" (core/aoDesligar.js), que é só do desligar manual.
// ==========================================
import { removerEscudosDoPoder, sincronizarEscudoDoPoder, normalizarEscudoAoLigar } from './escudos.js';
import { podeUsar, gastarUso } from './usosPoder.js';
import { emRecarga, iniciarRecarga } from './recargaPoder.js';
import { poderBloqueado } from './racas.js';
import { FATOR_EXIBICAO_VITAIS, getTetoExibidoComFator, capturarMaximosAtuais, rescalarVitaisProporcional } from './vitals.js';

export const ENERGIAS_CUSTO = ['mana', 'aura', 'chakra', 'corpo'];
export const MODOS_CUSTO = ['fixo', 'percMax'];
export const LIMITE_CUSTO_POR_TURNO = 1e12;
export const LIMITE_CUSTOS_POR_TURNO = 4;
const LIMITE_PERCENTUAL = 100;

// Valida UM custo. { custo, aviso }: custo = objeto limpo ou null (sem custo / inválido); aviso só se o dado veio inválido.
function lerUmCusto(bruto) {
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

// Lê e valida TODOS os custos de um Poder. Aceita o formato antigo (UM objeto) ou uma LISTA (ex.: 10% de corpo e 10% de aura).
// { custos, aviso }: `custos` = lista limpa (no máximo LIMITE_CUSTOS_POR_TURNO); aviso só se algum dado veio inválido.
export function lerCustosPorTurno(bruto) {
    const itens = Array.isArray(bruto) ? bruto : [bruto];
    const custos = [];
    const avisos = [];
    itens.forEach((it) => {
        const r = lerUmCusto(it);
        if (r.aviso) avisos.push(r.aviso);
        else if (r.custo && custos.length < LIMITE_CUSTOS_POR_TURNO) custos.push(r.custo);
    });
    return { custos, aviso: avisos[0] || '' };
}

// Formato antigo: só o primeiro custo. { custo, aviso }: custo = objeto limpo ou null.
export function lerCustoPorTurno(bruto) {
    const r = lerCustosPorTurno(bruto);
    return { custo: r.custos[0] || null, aviso: r.aviso };
}

// Só o primeiro custo (formato antigo). Para a lista toda use normalizarCustosPorTurno.
export const normalizarCustoPorTurno = (bruto) => lerCustosPorTurno(bruto).custos[0] || null;
export const normalizarCustosPorTurno = (bruto) => lerCustosPorTurno(bruto).custos;

// O que gravar no Poder: um custo = objeto (mesmo formato de antes); vários = lista; nenhum = null.
export function custoPorTurnoParaSalvar(bruto) {
    const custos = normalizarCustosPorTurno(bruto);
    if (custos.length === 0) return null;
    return custos.length === 1 ? custos[0] : custos;
}

// "5% de chakra por turno" / "12 de mana por turno" / "10% de corpo e 10% de aura por turno". Vazio sem custo.
export function descreverCustoPorTurno(poder) {
    const custos = normalizarCustosPorTurno(poder && poder.custoPorTurno);
    if (custos.length === 0) return '';
    const partes = custos.map((c) => `${c.valor.toLocaleString('pt-BR')}${c.modo === 'percMax' ? '%' : ''} de ${c.energia}`);
    const texto = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}` : partes[0];
    return `${texto} por turno`;
}

const exibido = (bruto) => Math.floor(bruto / FATOR_EXIBICAO_VITAIS);

// Custo de UM Poder agora (tudo ou nada). `saldo`/`tetos` são caches compartilhados entre Poderes (saldo já descontado dos anteriores).
// Devolve { parciais: [{ id, nome, energia, bruto, valor }], faltou: energia | null, saldoTemp }. NÃO mexe na ficha e NÃO olha p.ativa.
function custoDoPoder(ficha, p, saldo, tetos) {
    const custos = normalizarCustosPorTurno(p && p.custoPorTurno);
    const parciais = [];
    const saldoTemp = {};
    if (custos.length === 0) return { parciais, faltou: null, saldoTemp };
    let faltou = null;
    for (const c of custos) {
        const reg = ficha[c.energia];
        if (saldoTemp[c.energia] === undefined) saldoTemp[c.energia] = saldo[c.energia] !== undefined ? saldo[c.energia] : Math.max(0, Number(reg && reg.atual) || 0);
        let bruto = 0;
        if (c.modo === 'fixo') bruto = c.valor * FATOR_EXIBICAO_VITAIS;
        else {
            if (tetos[c.energia] === undefined) {
                try { tetos[c.energia] = Number(getTetoExibidoComFator(c.energia, ficha)) || 0; } catch (e) { tetos[c.energia] = 0; }
            }
            bruto = tetos[c.energia] * (c.valor / 100);
        }
        if (!Number.isFinite(bruto)) bruto = Number.MAX_VALUE;
        if (!reg || saldoTemp[c.energia] < bruto) { faltou = c.energia; break; }
        saldoTemp[c.energia] -= bruto;
        parciais.push({ id: p.id, nome: p.nome, energia: c.energia, bruto, valor: exibido(bruto) });
    }
    return { parciais, faltou, saldoTemp };
}

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
        // Tudo ou nada: se faltar saldo em QUALQUER energia, o Poder desliga sem pagar nenhuma delas.
        const { parciais, faltou, saldoTemp } = custoDoPoder(ficha, p, saldo, tetos);
        if (faltou) { desligar.push({ id: p.id, nome: p.nome, energia: faltou }); return; }
        Object.keys(saldoTemp).forEach((k) => { saldo[k] = saldoTemp[k]; });
        parciais.forEach(g => gastos.push(g));
    });
    return { gastos, desligar };
}

// 💥 Custo NA ATIVAÇÃO (opção por Poder `cobrarAoAtivar: true`; ausente = só liga, nada se gasta). Ao LIGAR cobra UMA vez os custos por turno
// do Poder (mesmas regras: tudo ou nada; % sobre o máximo ANTES de ligar). Nos turnos seguintes a cobrança por turno segue como sempre
// (o início de turno só cobra Poder já ligado, então ligar durante o próprio turno não cobra duas vezes nele).
// Chamar com o Poder AINDA desligado, dentro do rascunho. { cobra, ok, faltou?, gastos, texto }. Com ok=false nada foi descontado.
export function cobrarCustoDeAtivacao(ficha, p) {
    const vazio = { cobra: false, ok: true, gastos: [], texto: '' };
    if (!ficha || !p || p.cobrarAoAtivar !== true) return vazio;
    const { parciais, faltou } = custoDoPoder(ficha, p, {}, {});
    if (parciais.length === 0 && !faltou) return vazio;
    if (faltou) return { cobra: true, ok: false, faltou, gastos: [], texto: `${p.nome} não ligou: sem ${faltou} para o custo de ativação` };
    parciais.forEach((g) => { ficha[g.energia].atual = Math.max(0, (Number(ficha[g.energia].atual) || 0) - g.bruto); });
    const texto = `${p.nome} consumiu ${parciais.map(g => `${g.valor.toLocaleString('pt-BR')} de ${g.energia}`).join(' e ')} ao ativar`;
    return { cobra: true, ok: true, gastos: parciais.map(g => ({ key: g.energia, valor: g.bruto })), texto };
}

// Desliga um Poder NO RASCUNHO pelo mesmo caminho do togglePoder (captura máximos -> desliga -> mantém a % dos vitais).
export function desligarPoderNoRascunho(ficha, id) {
    const p = (ficha.poderes || []).find(po => po && (po.id === id || String(po.id) === String(id)));
    if (!p || !p.ativa) return false;
    const antes = capturarMaximosAtuais(ficha);
    p.ativa = false;
    rescalarVitaisProporcional(ficha, antes);
    // 🛡️ O escudo que o Poder criou ao ligar (escudoAoLigar) some junto.
    removerEscudosDoPoder(ficha, p.id);
    return true;
}

// Liga um Poder NO RASCUNHO pelo mesmo caminho do togglePoder, com as mesmas travas (usos limitados e recarga em turnos).
// Devolve { ok, motivo?, semEspacoEscudo? }. Quem chama escolhe o texto do feed.
export function ligarPoderNoRascunho(ficha, id, cenaId = 'default', cenario = null) {
    const p = (ficha && ficha.poderes || []).find(po => po && String(po.id) === String(id));
    if (!p) return { ok: false, motivo: 'não existe na ficha' };
    if (p.ativa) return { ok: false, motivo: 'já está ligado' };
    if (!podeUsar(ficha, p, cenaId)) return { ok: false, motivo: 'sem usos restantes' };
    if (emRecarga(p)) return { ok: false, motivo: 'em recarga' };
    if (poderBloqueado(cenario, ficha, p).bloqueado) return { ok: false, motivo: 'bloqueada (Habilidade de Raça)' };
    const antes = capturarMaximosAtuais(ficha);
    // 💥 Custo na ativação (opção `cobrarAoAtivar`): sem energia, não liga e nada é gasto (nem uso, nem recarga).
    const cobranca = cobrarCustoDeAtivacao(ficha, p);
    if (!cobranca.ok) return { ok: false, motivo: `sem ${cobranca.faltou} para o custo de ativação` };
    p.ativa = true;
    gastarUso(ficha, p, cenaId);
    iniciarRecarga(p);
    const semEspacoEscudo = !!(normalizarEscudoAoLigar(p.escudoAoLigar) && !sincronizarEscudoDoPoder(ficha, p, true));
    rescalarVitaisProporcional(ficha, antes);
    return { ok: true, semEspacoEscudo, textoCobranca: cobranca.texto, gastosCobranca: cobranca.gastos };
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
    const ids = [];
    gastos.forEach((g) => {
        ficha[g.energia].atual = Math.max(0, (Number(ficha[g.energia].atual) || 0) - g.bruto);
        textos.push(`${g.nome} consumiu ${g.valor.toLocaleString('pt-BR')} de ${g.energia}`);
    });
    desligar.forEach((d) => {
        if (desligarPoderNoRascunho(ficha, d.id)) desligados++, ids.push(d.id), textos.push(`${d.nome} desligou: sem ${d.energia} para o custo por turno`);
    });
    // `gastos`: energia realmente descontada ({ energia, valor } na escala de `atual`), para o Zenkai (core/zenkaiMedicao.js).
    return { alterou: gastos.length > 0 || desligar.length > 0, textos, desligados, ids, gastos: gastos.map(g => ({ key: g.energia, valor: g.bruto })) };
}
