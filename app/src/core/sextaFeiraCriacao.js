// ==========================================
// SEXTA-FEIRA — CRIAÇÃO COM CONFIRMAÇÃO (lógica pura).
//
// A Sexta-Feira nunca grava nada sozinha: ela chama uma ferramenta propor_* e o app monta aqui um
// objeto no MESMO formato que as telas do app criam (Grimório de Poderes, Técnicas Elementais,
// Arsenal, Mapa), com valores inválidos corrigidos e avisos de equilíbrio. A proposta vira um cartão
// no chat: o Mestre aplica; o jogador manda pra aprovação do Mestre.
//
// Formatos espelhados de:
//   poder/habilidade/forma -> components/poderes/PoderesFormContext.jsx (salvarNovoPoder)
//   magia                  -> components/arsenal/ElementosFormContext.jsx (salvarNovoElem)
//   item                   -> components/arsenal/ArsenalFormContext.jsx (salvarNovoItem)
//   npc (dummie do Mapa)   -> components/mapa/MapaFerramentasMestre.jsx (criar dummie)
// ==========================================
import { ATRIBUTOS_AGRUPADOS, PROPRIEDADE_OPTIONS } from './efeitos-constants.js';
import { FATOR_EXIBICAO_VITAIS } from './vitals.js';

export const ATRIBUTOS_EFEITO = ATRIBUTOS_AGRUPADOS.flatMap(g => g.options);
export const PROPRIEDADES_EFEITO = [...PROPRIEDADE_OPTIONS];
export const CATEGORIAS_PODER = ['habilidade', 'poder', 'forma'];
export const VERTENTES_PODER = ['', 'Acumulativo', 'Elemental', 'Conceitual', 'Utilitario'];
export const TIPOS_MECANICA_MAGIA = ['ataque', 'saving', 'infusao', 'suporte'];
export const ATRIBUTOS_SAVING = ['forca', 'destreza', 'constituicao', 'sabedoria', 'inteligencia', 'stamina', 'carisma', 'energiaEsp'];
export const BONUS_MAGIA = ['nenhum', 'mult_dano', 'dano_bruto', 'letalidade'];
export const ENERGIAS_COMBUSTAO = ['flexivel', 'mana', 'aura', 'chakra', 'corpo', 'pontosVitais', 'pontosMortais', 'livre'];
export const ALVOS_MAGIA = ['todos', 'inimigos', 'aliados'];
export const TIPOS_ITEM = ['arma', 'armadura', 'artefato'];
export const TIPOS_ARMA = ['espada', 'arco', 'lança', 'machado', 'adaga', 'cajado', 'arma de fogo', 'manopla', 'foice', 'chicote', 'martelo', 'escudo'];
export const RARIDADES_ITEM = ['comum', 'rara', 'avançada', 'lendaria', 'lendaria (Longuinus)', 'espiritual', 'fantasma nobre'];
export const BONUS_ITEM = ['mult_dano', 'dano_bruto', 'letalidade', 'bonus_acerto', 'bonus_evasiva', 'bonus_resistencia', 'mult_escudo'];
export const DEFESAS_NPC = ['evasiva', 'resistencia'];

// Elementos das abas das Técnicas Elementais (components/arsenal/ElementosFormContext.jsx >
// ABAS_GRIMORIO_STATIC). Um nome fora daqui ainda é aceito, mas cai em "Pergaminhos Perdidos".
export const ELEMENTOS_CONHECIDOS = [
    'Fogo', 'Raio', 'Vento', 'Agua', 'Terra', 'Neutro',
    'Fogo Verdadeiro', 'Raio Verdadeiro', 'Agua Verdadeira', 'Vento Verdadeiro', 'Terra Verdadeira',
    'Solar', 'Energia', 'Gelo', 'Vacuo', 'Natureza',
    'Solar Verdadeiro', 'Energia Verdadeira', 'Gelo Verdadeiro', 'Vacuo Verdadeiro', 'Natureza Verdadeira',
    'Luz', 'Trevas', 'Ether', 'Celestial', 'Infernal', 'Caos', 'Criacao', 'Destruicao', 'Cosmos', 'Vida', 'Morte', 'Vazio',
    'Aura Pura', 'Projeção de Aura', 'Artes Marciais', 'Reforço Físico', 'Fusões Básicas', 'Fusões Avançadas',
];
export const VISIBILIDADES_HP = ['todos', 'mestre'];

// Ranks da Tier List (mesma ordem/ids de TODOS_RANKS em components/ia/AIFormContext.jsx).
export const IDS_RANKS = [
    'EX', 'Z+', 'Z', 'Z-', 'S+', 'S', 'S-', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-',
    ...['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'].flatMap(l => [`${l}+`, l, `${l}-`]),
];

// Onde cada tipo entra na ficha.
export const CAMPO_FICHA_POR_TIPO = { poder: 'poderes', magia: 'ataquesElementais', item: 'inventario' };
export const ROTULO_TIPO = { poder: 'Habilidade/Poder/Forma', magia: 'Técnica Elemental', item: 'Item do Arsenal', npc: 'NPC do Mapa', tierlist: 'Tier List' };

const texto = (v, max = 2000) => String(v ?? '').trim().substring(0, max);
const numero = (v, padrao, min = -Infinity, max = Infinity) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};
const inteiro = (v, padrao, min, max) => Math.round(numero(v, padrao, min, max));
// Alcance: as telas usam parseFloat(x) || 1, então 0 (ou vazio) vira 1.
const alcance = (v) => { const n = numero(v, 1, 0, 10000); return n > 0 ? n : 1; };
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Escolhe um valor da lista (aceita maiúsculas/acentos diferentes); fora da lista -> padrão + aviso.
function escolher(valor, lista, padrao, rotulo, avisos) {
    if (valor === undefined || valor === null || valor === '') return padrao;
    const achado = lista.find(op => semAcento(op) === semAcento(valor));
    if (achado !== undefined) return achado;
    avisos.push(`${rotulo} "${valor}" não existe no sistema; usei "${padrao || 'Padrão'}".`);
    return padrao;
}

function normalizarEfeitos(lista, padraoAtributo, avisos, rotulo) {
    const itens = Array.isArray(lista) ? lista : [];
    return itens.slice(0, 12).map((e, i) => {
        const avisosEfeito = [];
        const efeito = {
            nome: texto(e?.nome, 80) || `Efeito ${i + 1}`,
            atributo: escolher(e?.atributo, ATRIBUTOS_EFEITO, padraoAtributo, 'Atributo', avisosEfeito),
            propriedade: escolher(e?.propriedade, PROPRIEDADES_EFEITO, 'base', 'Propriedade', avisosEfeito),
            // O app guarda o valor como texto digitado.
            valor: String(numero(e?.valor, 0)),
        };
        avisosEfeito.forEach(a => avisos.push(`${rotulo} ${i + 1}: ${a}`));
        return efeito;
    });
}

export function normalizarPoder(dados) {
    const d = dados || {};
    const avisos = [];
    const categoria = escolher(d.categoria, CATEGORIAS_PODER, 'habilidade', 'Categoria', avisos);
    const vertente = escolher(d.vertente, VERTENTES_PODER, '', 'Vertente', avisos);
    const objeto = {
        nome: texto(d.nome, 120),
        descricao: texto(d.descricao),
        vertente,
        elemento: /elemental/i.test(vertente) ? texto(d.elemento, 60) : '',
        elementosAfetados: texto(d.elementosAfetados, 200),
        categoria,
        ativa: false,
        efeitos: normalizarEfeitos(d.efeitos, 'forca', avisos, 'Efeito ativo'),
        efeitosPassivos: normalizarEfeitos(d.efeitosPassivos, 'evasiva', avisos, 'Efeito passivo'),
        imagemUrl: '',
        dadosQtd: inteiro(d.dadosQtd, 0, 0, 1000),
        dadosFaces: inteiro(d.dadosFaces, 20, 1, 1000),
        custoPercentual: numero(d.custoPercentual, 0, 0, 100),
        alcance: alcance(d.alcance),
        area: numero(d.area, 0, 0, 10000),
        armaVinculada: '',
        pasta: texto(d.pasta, 60),
    };
    if (categoria === 'forma') {
        objeto.maestria = numero(d.maestria, 0, 0, 100);
        objeto.fadigaPorUso = numero(d.fadigaPorUso, 15, 0, 100);
    } else {
        objeto.maestria = numero(d.maestria, 0, 0, 100);
        objeto.maestriaRequerida = numero(d.maestriaRequerida, 0, 0, 100);
    }
    if (!objeto.nome) avisos.push('Falta o nome.');
    return { objeto, avisos, valido: !!objeto.nome };
}

export function normalizarMagia(dados) {
    const d = dados || {};
    const avisos = [];
    const tipoMecanica = escolher(d.tipoMecanica, TIPOS_MECANICA_MAGIA, 'ataque', 'Mecânica', avisos);
    const objeto = {
        nome: texto(d.nome, 120),
        descricao: texto(d.descricao),
        elemento: texto(d.elemento, 60) || 'Neutro',
        elementosAfetados: texto(d.elementosAfetados, 200),
        bonusTipo: escolher(d.bonusTipo, BONUS_MAGIA, 'nenhum', 'Bônus', avisos),
        bonusValor: String(numero(d.bonusValor, 0)),
        custoValor: numero(d.custoValor, 0, 0, 1e15),
        dadosExtraQtd: inteiro(d.dadosExtraQtd, 0, 0, 1000),
        dadosExtraFaces: inteiro(d.dadosExtraFaces, 20, 1, 1000),
        energiaCombustao: escolher(d.energiaCombustao, ENERGIAS_COMBUSTAO, 'flexivel', 'Energia', avisos),
        tipoMecanica,
        savingAttr: escolher(d.savingAttr, ATRIBUTOS_SAVING, 'destreza', 'Atributo de resistência', avisos),
        alcanceQuad: alcance(d.alcanceQuad),
        areaQuad: numero(d.areaQuad, 0, 0, 10000),
        alvosAfetados: escolher(d.alvosAfetados, ALVOS_MAGIA, 'todos', 'Alvos', avisos),
        duracaoZona: inteiro(d.duracaoZona, 0, 0, 1000),
        equipado: false,
    };
    // Acerta maiúsculas/acentos de um elemento conhecido; desconhecido só gera aviso.
    const conhecido = ELEMENTOS_CONHECIDOS.find(e => semAcento(e) === semAcento(objeto.elemento));
    if (conhecido) objeto.elemento = conhecido;
    else if (!/^Elemento |Magia|Truque/i.test(objeto.elemento)) avisos.push(`Elemento "${objeto.elemento}" não tem aba própria nas Técnicas Elementais (vai para "Pergaminhos Perdidos").`);
    if (!objeto.nome) avisos.push('Falta o nome.');
    return { objeto, avisos, valido: !!objeto.nome };
}

export function normalizarItem(dados) {
    const d = dados || {};
    const avisos = [];
    const tipo = escolher(d.tipo, TIPOS_ITEM, 'arma', 'Tipo', avisos);
    const arma = tipo === 'arma';
    const objeto = {
        nome: texto(d.nome, 120),
        tipo,
        elemento: 'Neutro',
        bonusTipo: escolher(d.bonusTipo, BONUS_ITEM, 'mult_dano', 'Bônus', avisos),
        bonusValor: String(numero(d.bonusValor, 0)),
        armaTipo: arma ? escolher(d.armaTipo, TIPOS_ARMA, 'espada', 'Tipo de arma', avisos) : '',
        raridade: escolher(d.raridade, RARIDADES_ITEM, 'comum', 'Raridade', avisos),
        dadosQtd: arma ? inteiro(d.dadosQtd, 1, 1, 1000) : 0,
        dadosFaces: arma ? inteiro(d.dadosFaces, 20, 1, 1000) : 0,
        alcance: arma ? alcance(d.alcance) : 0,
        efeitos: arma ? normalizarEfeitos(d.efeitos, 'forca', avisos, 'Efeito ativo') : [],
        efeitosPassivos: arma ? normalizarEfeitos(d.efeitosPassivos, 'evasiva', avisos, 'Efeito passivo') : [],
        equipado: false,
    };
    if (!arma && ((d.efeitos || []).length || (d.efeitosPassivos || []).length)) avisos.push('Só armas guardam efeitos no Arsenal; os efeitos foram ignorados.');
    if (!objeto.nome) avisos.push('Falta o nome.');
    return { objeto, avisos, valido: !!objeto.nome };
}

// NPC/dummie do Mapa. `vida` vem na escala EXIBIDA (a mesma que o Mestre digita no Mapa).
export function normalizarNpc(dados) {
    const d = dados || {};
    const avisos = [];
    const vidaExibida = numero(d.vida, 100, 1, 1e15);
    const hp = Math.round(vidaExibida * FATOR_EXIBICAO_VITAIS);
    const objeto = {
        nome: texto(d.nome, 60) || 'Entidade',
        hpMax: hp,
        hpAtual: hp,
        tipoDefesa: escolher(d.tipoDefesa, DEFESAS_NPC, 'evasiva', 'Defesa', avisos),
        valorDefesa: numero(d.valorDefesa, 10, 0, 1e6),
        visibilidadeHp: escolher(d.visibilidadeHp, VISIBILIDADES_HP, 'todos', 'Visibilidade', avisos),
    };
    const quantidade = inteiro(d.quantidade, 1, 1, 10);
    return { objeto, avisos, valido: true, quantidade };
}

export function normalizarTierList(dados, nomesConhecidos = []) {
    const avisos = [];
    const itens = (Array.isArray(dados?.ranks) ? dados.ranks : []).slice(0, 60);
    const vistos = new Set();
    const ranks = [];
    itens.forEach((r) => {
        const nome = texto(r?.nome, 80);
        if (!nome || vistos.has(nome)) return;
        const rank = IDS_RANKS.find(id => id === String(r?.rank || '').trim().toUpperCase());
        if (!rank) { avisos.push(`Rank "${r?.rank}" de ${nome} não existe; ignorado.`); return; }
        vistos.add(nome);
        ranks.push({ nome, rank });
    });
    const desconhecidos = ranks.filter(r => nomesConhecidos.length && !nomesConhecidos.includes(r.nome)).map(r => r.nome);
    if (desconhecidos.length) avisos.push(`Sem ficha/avatar na mesa: ${desconhecidos.join(', ')} (entram como entidade manual).`);
    return { objeto: { ranks }, avisos, valido: ranks.length > 0 };
}

export function normalizarProposta(tipo, dados, extras = {}) {
    switch (tipo) {
        case 'poder': return normalizarPoder(dados);
        case 'magia': return normalizarMagia(dados);
        case 'item': return normalizarItem(dados);
        case 'npc': return normalizarNpc(dados);
        case 'tierlist': return normalizarTierList(dados, extras.nomesConhecidos);
        default: return { objeto: null, avisos: [`Tipo desconhecido: ${tipo}`], valido: false };
    }
}

// ⚖️ Comparação com o que o personagem já tem: avisa se ficou muito acima (ou barato demais).
export function avaliarEquilibrio(tipo, objeto, fichaAlvo) {
    const avisos = [];
    if (!objeto || !fichaAlvo) return avisos;
    const lista = (v) => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : [])).filter(Boolean);
    const dadosMedios = (qtd, faces) => (Number(qtd) || 0) * ((Number(faces) || 0) + 1) / 2;
    if (tipo === 'poder' || tipo === 'item') {
        const existentes = lista(tipo === 'poder' ? fichaAlvo.poderes : fichaAlvo.inventario)
            .map(p => dadosMedios(p.dadosQtd, p.dadosFaces)).filter(v => v > 0);
        const novo = dadosMedios(objeto.dadosQtd, objeto.dadosFaces);
        if (novo > 0 && existentes.length) {
            const maior = Math.max(...existentes);
            if (novo > maior * 1.5) avisos.push(`Dano médio ${novo.toFixed(1)} vs. o maior atual ${maior.toFixed(1)}: bem mais forte que o que o personagem já tem.`);
        }
        const efeitosGrandes = [...(objeto.efeitos || []), ...(objeto.efeitosPassivos || [])]
            .filter(e => ['mgeral', 'mabs', 'munico', 'mbase', 'mformas'].includes(e.propriedade) && Number(e.valor) >= 2);
        if (efeitosGrandes.length) avisos.push('Tem multiplicador de 2x ou mais: impacto grande no Poder Calculado.');
    }
    if (tipo === 'poder' && objeto.categoria !== 'forma' && objeto.dadosQtd > 0 && !objeto.custoPercentual) {
        avisos.push('Causa dano sem custo de energia.');
    }
    if (tipo === 'magia') {
        const existentes = lista(fichaAlvo.ataquesElementais).map(m => dadosMedios(m.dadosExtraQtd, m.dadosExtraFaces)).filter(v => v > 0);
        const novo = dadosMedios(objeto.dadosExtraQtd, objeto.dadosExtraFaces);
        if (novo > 0 && existentes.length && novo > Math.max(...existentes) * 1.5) avisos.push('Dados extras bem acima das outras Técnicas do personagem.');
        if (!objeto.custoValor && objeto.tipoMecanica === 'ataque') avisos.push('Técnica de ataque sem custo.');
    }
    return avisos;
}

// Anexa um item novo a uma lista da ficha que pode ter vindo do banco como objeto ({0:..,1:..}).
export function anexarNaLista(atual, objeto) {
    const base = Array.isArray(atual) ? atual : (atual && typeof atual === 'object' ? Object.values(atual) : []);
    return [...base.filter(Boolean), objeto];
}

// Resumo curto pra cartões e pra lista de pendências do Mestre.
export function resumirProposta(tipo, objeto) {
    if (!objeto) return '';
    if (tipo === 'poder') return `${objeto.categoria} · ${objeto.dadosQtd ? `${objeto.dadosQtd}d${objeto.dadosFaces}` : 'sem dano'} · custo ${objeto.custoPercentual}% · ${(objeto.efeitos || []).length + (objeto.efeitosPassivos || []).length} efeito(s)`;
    if (tipo === 'magia') return `${objeto.elemento} · ${objeto.tipoMecanica} · ${objeto.dadosExtraQtd ? `${objeto.dadosExtraQtd}d${objeto.dadosExtraFaces}` : 'sem dados extras'} · custo ${objeto.custoValor}`;
    if (tipo === 'item') return `${objeto.tipo}${objeto.armaTipo ? ` (${objeto.armaTipo})` : ''} · ${objeto.raridade}${objeto.dadosQtd ? ` · ${objeto.dadosQtd}d${objeto.dadosFaces}` : ''}`;
    if (tipo === 'npc') return `Vida ${Math.round(objeto.hpMax / FATOR_EXIBICAO_VITAIS).toLocaleString('pt-BR')} · ${objeto.tipoDefesa} ${objeto.valorDefesa}`;
    if (tipo === 'tierlist') return `${(objeto.ranks || []).length} personagem(ns) classificados`;
    return '';
}

// ---------- Declarações das ferramentas de criação (formato do Gemini) ----------
const EFEITOS_SCHEMA = {
    type: 'ARRAY',
    description: 'Efeitos numéricos: atributo + propriedade + valor.',
    items: {
        type: 'OBJECT',
        properties: {
            nome: { type: 'STRING' },
            atributo: { type: 'STRING', enum: ATRIBUTOS_EFEITO },
            propriedade: { type: 'STRING', enum: PROPRIEDADES_EFEITO, description: 'base = soma fixa; mbase/mgeral/mformas/mabs/munico = multiplicadores; reducaocusto; regeneracao; bonus_acerto; elemento_inato; furia_berserker.' },
            valor: { type: 'NUMBER' },
        },
        required: ['atributo', 'propriedade', 'valor'],
    },
};
const ALVO_SCHEMA = { type: 'STRING', description: 'Personagem que recebe (vazio = quem está pedindo). Jogadores só podem pedir para si.' };

export const DECLARACOES_CRIACAO = [
    {
        name: 'propor_habilidade',
        description: 'Prepara uma Habilidade, Poder ou Forma no formato do Grimório. NÃO grava: vira um cartão para o Mestre aplicar (ou o jogador mandar para aprovação).',
        parameters: {
            type: 'OBJECT',
            properties: {
                alvo: ALVO_SCHEMA,
                categoria: { type: 'STRING', enum: CATEGORIAS_PODER },
                nome: { type: 'STRING' },
                descricao: { type: 'STRING' },
                vertente: { type: 'STRING', enum: VERTENTES_PODER.filter(Boolean), description: 'Vazio = Padrão. Use Elemental para ter elemento.' },
                elemento: { type: 'STRING', description: 'Só com vertente Elemental. Ex.: Fogo, Raio, Gelo, Luz, Trevas.' },
                elementosAfetados: { type: 'STRING' },
                dadosQtd: { type: 'INTEGER' }, dadosFaces: { type: 'INTEGER' },
                custoPercentual: { type: 'NUMBER', description: '% de energia gasta ao usar.' },
                alcance: { type: 'NUMBER' }, area: { type: 'NUMBER' },
                maestria: { type: 'NUMBER' }, maestriaRequerida: { type: 'NUMBER' }, fadigaPorUso: { type: 'NUMBER', description: 'Só Formas.' },
                efeitos: EFEITOS_SCHEMA, efeitosPassivos: EFEITOS_SCHEMA,
            },
            required: ['nome', 'categoria'],
        },
    },
    {
        name: 'propor_magia',
        description: 'Prepara uma Técnica Elemental (magia). NÃO grava: vira um cartão de confirmação.',
        parameters: {
            type: 'OBJECT',
            properties: {
                alvo: ALVO_SCHEMA,
                nome: { type: 'STRING' }, descricao: { type: 'STRING' },
                elemento: { type: 'STRING', description: 'Ex.: Fogo, Raio, Vento, Agua, Terra, Neutro, Gelo, Luz, Trevas, Solar...' },
                elementosAfetados: { type: 'STRING' },
                tipoMecanica: { type: 'STRING', enum: TIPOS_MECANICA_MAGIA },
                savingAttr: { type: 'STRING', enum: ATRIBUTOS_SAVING },
                bonusTipo: { type: 'STRING', enum: BONUS_MAGIA }, bonusValor: { type: 'NUMBER' },
                custoValor: { type: 'NUMBER' }, energiaCombustao: { type: 'STRING', enum: ENERGIAS_COMBUSTAO },
                dadosExtraQtd: { type: 'INTEGER' }, dadosExtraFaces: { type: 'INTEGER' },
                alcanceQuad: { type: 'NUMBER' }, areaQuad: { type: 'NUMBER' },
                alvosAfetados: { type: 'STRING', enum: ALVOS_MAGIA }, duracaoZona: { type: 'INTEGER' },
            },
            required: ['nome', 'elemento'],
        },
    },
    {
        name: 'propor_item',
        description: 'Prepara um item do Arsenal (arma, armadura ou artefato). NÃO grava: vira um cartão de confirmação.',
        parameters: {
            type: 'OBJECT',
            properties: {
                alvo: ALVO_SCHEMA,
                nome: { type: 'STRING' },
                tipo: { type: 'STRING', enum: TIPOS_ITEM },
                armaTipo: { type: 'STRING', enum: TIPOS_ARMA },
                raridade: { type: 'STRING', enum: RARIDADES_ITEM },
                bonusTipo: { type: 'STRING', enum: BONUS_ITEM }, bonusValor: { type: 'NUMBER' },
                dadosQtd: { type: 'INTEGER' }, dadosFaces: { type: 'INTEGER' }, alcance: { type: 'NUMBER' },
                efeitos: EFEITOS_SCHEMA, efeitosPassivos: EFEITOS_SCHEMA,
            },
            required: ['nome', 'tipo'],
        },
    },
    {
        name: 'propor_npc',
        description: 'SÓ MESTRE: prepara NPCs/dummies para a cena atual do Mapa. NÃO cria: vira um cartão para o Mestre aplicar. Use poder_do_grupo antes para equilibrar a Vida.',
        parameters: {
            type: 'OBJECT',
            properties: {
                nome: { type: 'STRING' },
                vida: { type: 'NUMBER', description: 'Vida máxima na escala mostrada na tela (a mesma do Mapa).' },
                tipoDefesa: { type: 'STRING', enum: DEFESAS_NPC }, valorDefesa: { type: 'NUMBER' },
                visibilidadeHp: { type: 'STRING', enum: VISIBILIDADES_HP },
                quantidade: { type: 'INTEGER', description: '1 a 10 cópias.' },
            },
            required: ['nome', 'vida'],
        },
    },
    {
        name: 'poder_do_grupo',
        description: 'SÓ MESTRE: Poder Calculado, Vida máxima e Fadiga dos personagens de jogadores, com médias — para equilibrar inimigos.',
        parameters: { type: 'OBJECT', properties: {} },
    },
    {
        name: 'propor_tier_list',
        description: 'SÓ MESTRE: sugere os ranks da Tier List do capítulo aberto. NÃO aplica: vira um cartão de confirmação.',
        parameters: {
            type: 'OBJECT',
            properties: {
                ranks: {
                    type: 'ARRAY',
                    items: { type: 'OBJECT', properties: { nome: { type: 'STRING' }, rank: { type: 'STRING', enum: IDS_RANKS } }, required: ['nome', 'rank'] },
                },
            },
            required: ['ranks'],
        },
    },
];

export const TIPO_POR_FERRAMENTA = {
    propor_habilidade: 'poder', propor_magia: 'magia', propor_item: 'item', propor_npc: 'npc', propor_tier_list: 'tierlist',
};
export const TIPOS_SO_MESTRE = ['npc', 'tierlist'];
