// ==========================================
// 🎲 LIMITE DE DADOS DAS TÉCNICAS ELEMENTAIS
//
// Cada nível de elemento tem um limite padrão de Dano vindo SÓ dos dados (o máximo que os dados da
// Técnica podem somar: qtd x faces). Ex.: Elemento Básico = 50, então 5d10 (50) é o teto; 6d10 passa.
//   Básicos 50 · Básicos Verdadeiros 150 · Avançados 300 · Avançados Verdadeiros 750 ·
//   Primordiais 750 · Primordiais Verdadeiros 1250 · Primordiais Absolutos 1750 · Astrais 2500 ·
//   Kekkei Genkai 400 · Kekkei Touta 800.
// Elementos fora dessa lista (Neutro, Cinético, Magias de Ciclo, Aura, Corpo...) não têm limite.
// A Técnica pode trazer um `limiteDados` próprio (o Mestre libera um teto diferente do padrão).
// ==========================================
import { normalizarNome } from './polaridade.js';

export const NIVEIS_LIMITE_DADOS = [
    { id: 'basicos', rotulo: 'Elementos Básicos', limite: 50, elementos: ['fogo', 'raio', 'vento', 'agua', 'terra'] },
    { id: 'basicos_verdadeiros', rotulo: 'Elementos Básicos Verdadeiros', limite: 150, verdadeiro: true, elementos: ['fogo', 'raio', 'vento', 'agua', 'terra'] },
    { id: 'avancados', rotulo: 'Elementos Avançados', limite: 300, elementos: ['solar', 'energia', 'gelo', 'vacuo', 'natureza'] },
    { id: 'avancados_verdadeiros', rotulo: 'Elementos Avançados Verdadeiros', limite: 750, verdadeiro: true, elementos: ['solar', 'energia', 'gelo', 'vacuo', 'natureza'] },
    { id: 'primordiais', rotulo: 'Elementos Primordiais', limite: 750, elementos: ['luz', 'trevas', 'ether', 'eter'] },
    { id: 'primordiais_verdadeiros', rotulo: 'Elementos Primordiais Verdadeiros', limite: 1250, elementos: ['celestial', 'infernal', 'caos'] },
    { id: 'absolutos', rotulo: 'Elementos Primordiais Absolutos', limite: 1750, elementos: ['criacao', 'destruicao', 'cosmos'] },
    { id: 'astrais', rotulo: 'Elementos Astrais', limite: 2500, elementos: ['vida', 'morte', 'vazio'] },
    { id: 'kekkei_genkai', rotulo: 'Kekkei Genkai', limite: 400, elementos: ['madeira', 'mineral', 'cinzas', 'igneo', 'lava', 'vapor', 'nevoa', 'tempestade', 'areia', 'tufao'] },
    { id: 'kekkei_touta', rotulo: 'Kekkei Touta', limite: 800, elementos: ['velocidade', 'poeira', 'veneno', 'cal', 'carbono', 'calor', 'som', 'magnetismo'] }
];

// "Elemento Madeira" -> chave 'madeira'; "Fogo Verdadeiro" -> { chave: 'fogo', verdadeiro: true }.
function lerElemento(nome) {
    let n = normalizarNome(nome).replace(/^elemento\s+/, '').trim();
    const verdadeiro = /\s+verdadeir[oa]$/.test(n);
    n = n.replace(/\s+verdadeir[oa]$/, '').trim();
    return { chave: n, verdadeiro };
}

// Nível (e limite padrão) de um elemento, ou null quando o elemento não tem limite.
export function getNivelLimiteDados(nomeElemento) {
    if (!nomeElemento) return null;
    const { chave, verdadeiro } = lerElemento(nomeElemento);
    if (!chave) return null;
    return NIVEIS_LIMITE_DADOS.find(n => n.elementos.includes(chave) && !!n.verdadeiro === verdadeiro) || null;
}

// Limite efetivo de uma Técnica: o `limiteDados` próprio (se for um número positivo) ou o padrão do elemento.
// null = sem limite.
export function getLimiteDadosTecnica(tecnica) {
    const proprio = parseFloat(tecnica?.limiteDados);
    if (Number.isFinite(proprio) && proprio > 0) return proprio;
    const nivel = getNivelLimiteDados(tecnica?.elemento);
    return nivel ? nivel.limite : null;
}

export function danoMaximoDosDados(qtd, faces) {
    const q = Math.max(0, Math.trunc(Number(qtd)) || 0);
    const f = Math.max(0, Math.trunc(Number(faces)) || 0);
    return q * f;
}

// Reduz a quantidade de dados até o dano máximo caber no limite (as faces ficam como estão).
// Sem limite, ou dentro dele, devolve o mesmo valor.
export function limitarDados(qtd, faces, limite) {
    const q = Math.max(0, Math.trunc(Number(qtd)) || 0);
    const f = Math.max(0, Math.trunc(Number(faces)) || 0);
    if (!Number.isFinite(limite) || limite === null || limite <= 0 || f <= 0) return { qtd: q, faces: f, limitado: false };
    if (q * f <= limite) return { qtd: q, faces: f, limitado: false };
    return { qtd: Math.floor(limite / f), faces: f, limitado: true };
}

// Atalho: dados de uma Técnica já respeitando o limite do elemento.
export function dadosLimitadosDaTecnica(tecnica, qtd, faces) {
    const limite = getLimiteDadosTecnica(tecnica);
    return { ...limitarDados(qtd, faces, limite), limite };
}
