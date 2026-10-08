// ==========================================
// POLARIDADE DOS ELEMENTOS (Yin / Yang / Neutro) — lógica pura.
// Cada elemento do sistema pertence a uma polaridade. Esse módulo só CLASSIFICA (nunca escreve na
// ficha): serve de base pra buffs/debuffs e habilidades que dependem de Yin e/ou Yang.
// Os nomes seguem a grafia dos seletores de elemento (sem acento: "Agua", "Vacuo", "Ether"...).
// A variante "Verdadeiro/Verdadeira" herda a polaridade do elemento base (ex.: Fogo Verdadeiro = Yin).
// ==========================================

export const POLARIDADES = {
    yang: { id: 'yang', nome: 'Yang', icone: '☀️' },
    yin: { id: 'yin', nome: 'Yin', icone: '🌑' },
    neutro: { id: 'neutro', nome: 'Neutro', icone: '⚪' }
};

// Divisão oficial por categoria: { yang: [...], yin: [...], neutro: [...] }.
export const POLARIDADE_POR_CATEGORIA = {
    'Elementos Básicos': { yang: ['Vento', 'Terra'], yin: ['Fogo', 'Raio'], neutro: ['Agua'] },
    'Elementos Avançados': { yang: ['Vacuo', 'Natureza'], yin: ['Solar', 'Energia'], neutro: ['Gelo'] },
    'Elementos Primordiais': { yang: ['Luz'], yin: ['Trevas'], neutro: ['Ether'] },
    'Elementos Primordiais Verdadeiros': { yang: ['Celestial'], yin: ['Infernal'], neutro: ['Caos'] },
    'Elementos Absolutos': { yang: ['Criacao'], yin: ['Destruicao'], neutro: ['Cosmos'] },
    'Elementos Astrais': { yang: ['Vida'], yin: ['Morte'], neutro: ['Vazio'] },
    'Kekkei Genkai': {
        yang: ['Elemento Madeira', 'Elemento Nevoa', 'Elemento Areia', 'Elemento Tempestade', 'Elemento Mineral'],
        yin: ['Elemento Vapor', 'Elemento Cinzas', 'Elemento Igneo', 'Elemento Lava', 'Elemento Tufao'],
        neutro: []
    },
    'Kekkei Touta': {
        yang: ['Elemento Poeira', 'Elemento Velocidade', 'Elemento Cal', 'Elemento Carbono'],
        yin: ['Elemento Veneno', 'Elemento Som', 'Elemento Magnetismo', 'Elemento Calor'],
        neutro: []
    }
};

// Remove acentos caractere a caractere (faixa 0x0300-0x036F após NFD), sem embutir acentos no código.
function normalizarNome(nome) {
    const decomposto = String(nome || '').trim().toLowerCase().normalize('NFD');
    let resultado = '';
    for (let i = 0; i < decomposto.length; i++) {
        const codigo = decomposto.charCodeAt(i);
        if (codigo < 0x0300 || codigo > 0x036f) resultado += decomposto[i];
    }
    return resultado;
}

// Tira o sufixo "Verdadeiro/Verdadeira" e o prefixo "Elemento " só pra casar variantes e apelidos
// ("Éter" = "Ether", "Trevas" = "Treva", "Vazio" etc.).
const APELIDOS = { eter: 'ether', treva: 'trevas', agua: 'agua', vacuo: 'vacuo', criacao: 'criacao', destruicao: 'destruicao' };

function chaveBase(nome) {
    let n = normalizarNome(nome).replace(/\s+verdadeir[oa]$/, '');
    n = APELIDOS[n] || n;
    return n;
}

const MAPA = (() => {
    const mapa = {};
    for (const grupos of Object.values(POLARIDADE_POR_CATEGORIA)) {
        for (const pol of ['yang', 'yin', 'neutro']) {
            for (const nome of grupos[pol]) {
                mapa[chaveBase(nome)] = pol;
                // Kekkei também aceita o nome sem o prefixo "Elemento " (ex.: "Madeira", "Lava").
                if (nome.startsWith('Elemento ')) mapa[chaveBase(nome.slice(9))] = pol;
            }
        }
    }
    return mapa;
})();

// 'yang' | 'yin' | 'neutro' | null (nome fora da divisão, ex.: Magias, Aura, Artes Marciais).
// "Neutro" (o não-elemento do Grimório) também devolve null: aqui Neutro é a polaridade de
// elementos como Água/Gelo/Éter, não "sem elemento".
export function getPolaridadeElemento(nome) {
    if (!nome) return null;
    return MAPA[chaveBase(nome)] || null;
}

// { id, nome, icone } da polaridade do elemento, ou null.
export function getInfoPolaridade(nome) {
    const id = getPolaridadeElemento(nome);
    return id ? POLARIDADES[id] : null;
}

// Rótulo curto pra listas/selects: "☀️ Yang". Vazio se o nome não tem polaridade.
export function rotuloPolaridade(nome) {
    const info = getInfoPolaridade(nome);
    return info ? `${info.icone} ${info.nome}` : '';
}

// Conta quantos elementos de uma lista (strings ou objetos { nome }) pertencem a cada polaridade.
export function contarPolaridades(elementos) {
    const total = { yang: 0, yin: 0, neutro: 0 };
    for (const e of Array.isArray(elementos) ? elementos : []) {
        const pol = getPolaridadeElemento(typeof e === 'string' ? e : e && e.nome);
        if (pol) total[pol] += 1;
    }
    return total;
}

// Polaridades dos Domínios treinados na ficha (ficha.dominios[nome] = { nivel }): só os de nível > 0.
// Devolve { yang, yin, neutro } com a lista de nomes de cada lado.
export function polaridadesDosDominios(ficha) {
    const resultado = { yang: [], yin: [], neutro: [] };
    const dominios = ficha && ficha.dominios;
    if (!dominios || typeof dominios !== 'object') return resultado;
    for (const [nome, dados] of Object.entries(dominios)) {
        if (!dados || !(Number(dados.nivel) > 0)) continue;
        const pol = getPolaridadeElemento(nome);
        if (pol) resultado[pol].push(nome);
    }
    return resultado;
}

// O personagem domina algum elemento dessa polaridade? (base pra condições "se for Yin/Yang").
export function temPolaridade(ficha, polaridade) {
    const lista = polaridadesDosDominios(ficha)[polaridade];
    return Array.isArray(lista) && lista.length > 0;
}

// Texto de <option>/chip: "Fogo · 🌑 Yin" (só o nome quando não há polaridade).
export function rotuloComPolaridade(nome) {
    const rotulo = rotuloPolaridade(nome);
    return rotulo ? `${nome} · ${rotulo}` : String(nome);
}
