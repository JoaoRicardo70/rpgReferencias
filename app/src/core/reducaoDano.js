// ==========================================
// 🛡️ REDUÇÃO DE DANO SEQUENCIAL — cada Redução/Resistência é aplicada UMA DE CADA VEZ sobre o
// dano que sobrou da anterior (e não somadas), então várias reduções altas nunca chegam a zerar o
// dano por acúmulo: 100 de dano, Redução 20% (→ 80) e Resistência a Fogo 30% (→ 56).
//
// Fontes de cada passo (percentual > 0 reduz, 100 = imune, negativo = vulnerável, −100 = dano x2):
//   1. ficha.reducoesDano — lista editada na Ficha: { id, nome, percentual, elemento }, onde
//      elemento = 'todos' (qualquer dano), 'fisico', 'pol:yin' | 'pol:yang' | 'pol:neutro' (qualquer
//      elemento daquela polaridade — ver core/polaridade.js) ou o id de um elemento (só vale contra ele).
//      Cada uma é uma "Habilidade de Redução de Dano" (nome, descrição). O alvo pode ser VÁRIOS
//      tipos de uma vez: r.elementos = ['fogo', 'agua'] (vale se bater com qualquer um; r.elemento
//      sozinho é o formato antigo). r.tipo = 'passiva' vale sempre; 'ativa' (padrão) só vale ligada
//      (ativa: false = desligada);
//   2. efeitos ativos (Poderes/Itens/Passivas/Classe...) com o atributo REDUCAO_DANO — qualquer dano;
//   3. Afinidades da Ficha contra o elemento do golpe: Resistente 50%, Imune 100%, Vulnerável −100%.
// O Domínio elemental (core/dominios.js) entra por fora, como mais um passo (ver Mapa).
// ==========================================
import { listarEfeitosDeAtributo } from './percepcaoPoder.js';
import { getPolaridadeElemento } from './polaridade.js';
import { chaveElemento } from './elementos.js';

export const ATRIBUTO_REDUCAO_DANO = 'reducao_dano';
export const ELEMENTO_TODOS = 'todos';
export const PREFIXO_POLARIDADE = 'pol:';
export const PERCENTUAL_MAX_REDUCAO = 100;
export const PERCENTUAL_MIN_REDUCAO = -1000;

export function limitarPercentualReducao(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return 0;
    return Math.min(PERCENTUAL_MAX_REDUCAO, Math.max(PERCENTUAL_MIN_REDUCAO, n));
}

function normalizarElemento(elemento) {
    return String(elemento || '').trim().toLowerCase();
}

export const TIPO_HABILIDADE_ATIVA = 'ativa';
export const TIPO_HABILIDADE_PASSIVA = 'passiva';

// Lista de alvos da habilidade: r.elementos (vários) ou, no formato antigo, r.elemento; vazio = todo dano.
export function getAlvosReducao(r) {
    const lista = r && Array.isArray(r.elementos) && r.elementos.length > 0 ? r.elementos : [r && r.elemento];
    const alvos = lista.map(normalizarElemento).filter(Boolean);
    return alvos.length > 0 ? alvos : [ELEMENTO_TODOS];
}

// Adiciona/remove um alvo da lista. 'todos' sozinho; um alvo específico tira o 'todos'; lista vazia volta pra 'todos'.
export function alternarAlvoReducao(alvos, alvo, adicionar) {
    const a = normalizarElemento(alvo);
    let lista = (Array.isArray(alvos) ? alvos : []).map(normalizarElemento).filter(Boolean);
    if (!a) return lista.length ? lista : [ELEMENTO_TODOS];
    if (adicionar) {
        if (a === ELEMENTO_TODOS) return [ELEMENTO_TODOS];
        lista = lista.filter(x => x !== ELEMENTO_TODOS);
        if (!lista.some(x => x === a || (!x.startsWith(PREFIXO_POLARIDADE) && !a.startsWith(PREFIXO_POLARIDADE) && chaveElemento(x) === chaveElemento(a)))) lista.push(a);
        return lista.slice(0, 30);
    }
    lista = lista.filter(x => x !== a);
    return lista.length ? lista : [ELEMENTO_TODOS];
}

// Passiva vale sempre; Ativa só quando não está desligada.
export function habilidadeEstaLigada(r) {
    if (!r) return false;
    if (r.tipo === TIPO_HABILIDADE_PASSIVA) return true;
    return r.ativa !== false;
}

function alvoCombina(alvo, elemento, el) {
    if (alvo === ELEMENTO_TODOS) return true;
    if (alvo.startsWith(PREFIXO_POLARIDADE)) {
        return (getPolaridadeElemento(elemento) || null) === alvo.slice(PREFIXO_POLARIDADE.length);
    }
    return chaveElemento(alvo) === el;
}

// Piso com tolerância: 1000 x 0,1 x 0,1 x 0,1 dá 0,99999… em ponto flutuante e não pode virar 0.
function inteiroSeguro(v) {
    return Math.floor(v + Math.max(1e-9, Math.abs(v) * 1e-12));
}

// Lista ORDENADA de passos que valem contra um golpe do `elemento` (vazio/'fisico' = sem elemento).
export function getPassosReducaoDano(ficha, elemento, nomeElemento) {
    const passos = [];
    if (!ficha) return passos;
    // Golpe sem elemento (o Mapa manda null) é dano Físico.
    const el = chaveElemento(elemento) || 'fisico';
    const elementoComPolaridade = getPolaridadeElemento(elemento) ? elemento : (nomeElemento || elemento);

    (Array.isArray(ficha.reducoesDano) ? ficha.reducoesDano : []).forEach((r) => {
        if (!habilidadeEstaLigada(r)) return;
        const alvos = getAlvosReducao(r);
        if (!alvos.some(a => alvoCombina(a, elementoComPolaridade, el))) return;
        const alvo = alvos.length === 1 ? alvos[0] : 'varios';
        const p = limitarPercentualReducao(r.percentual);
        if (p === 0) return;
        passos.push({ nome: String(r.nome || '').trim() || (alvo === ELEMENTO_TODOS ? 'Redução de Dano' : 'Resistência'), percentual: p, origem: 'ficha' });
    });

    listarEfeitosDeAtributo(ficha, ATRIBUTO_REDUCAO_DANO).forEach((e) => {
        const p = limitarPercentualReducao(e.valor);
        if (p === 0) return;
        passos.push({ nome: e.nome || 'Redução (efeito)', percentual: p, origem: 'efeito' });
    });

    const af = ficha.afinidades;
    if (af && el && el !== 'fisico') {
        const tem = (lista) => (lista || []).some(id => chaveElemento(id) === el);
        if (tem(af.imunidades)) passos.push({ nome: 'IMUNE', percentual: 100, origem: 'afinidade' });
        else if (tem(af.vulnerabilidades)) passos.push({ nome: 'VULNERÁVEL', percentual: -100, origem: 'afinidade' });
        else if (tem(af.resistencias)) passos.push({ nome: 'RESISTENTE', percentual: 50, origem: 'afinidade' });
    }
    return passos;
}

// Aplica os passos em sequência. Guarda o valor fracionado entre os passos e só arredonda
// (pra baixo) no fim, pra a ordem e o arredondamento não gerarem diferenças.
export function aplicarReducoesSequenciais(dano, passos) {
    const inicial = Math.max(0, Number(dano) || 0);
    let atual = inicial;
    const detalhe = [];
    (Array.isArray(passos) ? passos : []).forEach((p) => {
        if (!p) return;
        const pct = limitarPercentualReducao(p.percentual);
        if (pct === 0) return;
        const antes = atual;
        atual = Math.max(0, atual * (1 - pct / 100));
        detalhe.push({ nome: p.nome, percentual: pct, antes: inteiroSeguro(antes), depois: inteiroSeguro(atual) });
    });
    return { inicial, final: inteiroSeguro(atual), detalhe };
}

// Texto curto pro feed: "100 → −20% Armadura → 80 → −30% Resistência a Fogo → 56".
export function descreverReducoes(resultado) {
    if (!resultado || !resultado.detalhe || resultado.detalhe.length === 0) return '';
    const partes = [String(resultado.inicial)];
    resultado.detalhe.forEach((d) => {
        const sinal = d.percentual >= 0 ? `−${d.percentual}%` : `+${Math.abs(d.percentual)}%`;
        partes.push(`${sinal} ${d.nome}`, String(d.depois));
    });
    return partes.join(' → ');
}
