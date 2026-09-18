import React, { createContext, useContext, useState, useRef, useCallback, useMemo } from 'react';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, enviarParaFeed } from '../../services/firebase-sync';
import { getPoderDeLutaStatus } from '../../core/engine';
import { pegarDoisPrimeirosDigitos } from '../../core/utils';

// ============================================================================
// 🔮 CONSTANTES MÁGICAS E REGRAS DO SISTEMA
// ============================================================================
export const emogis = {
    'Fogo': '🔥', 'Agua': '💧', 'Raio': '⚡', 'Terra': '🪨', 'Vento': '🌪️',
    'Fogo Verdadeiro': '🔥', 'Agua Verdadeira': '💧', 'Raio Verdadeiro': '⚡', 'Terra Verdadeira': '🪨', 'Vento Verdadeiro': '🌪️',
    'Solar': '☀️', 'Solar Verdadeiro': '☀️', 'Gelo': '❄️', 'Gelo Verdadeiro': '❄️', 'Natureza': '🌿', 'Natureza Verdadeira': '🌿', 'Energia': '💫', 'Energia Verdadeira': '💫', 'Vacuo': '🕳️', 'Vacuo Verdadeiro': '🕳️',
    'Luz': '✨', 'Trevas': '🌒', 'Ether': '🌌', 'Celestial': '🌟', 'Infernal': '🌋', 'Caos': '🌀', 'Criacao': '🎇', 'Destruicao': '💥', 'Cosmos': '♾️',
    'Vida': '🌺', 'Morte': '💀', 'Vazio': '⬛', 'Neutro': '⚪',
    'Magia de Osso': '🦴', 'Magia de Sangue': '🩸', 'Magia de Borracha': '🎈', 'Magia de Sal': '🧂', 'Magia de Alma': '👻', 'Magia de Tremor': '🫨', 'Magia de Gravidade': '🌌', 'Magia de Equipamento': '⚙️', 'Magia de Tempo': '⏳', 'Magia Draconica': '🐉', 'Magia de Espelho': '🪞', 'Magia de Explosao': '💥', 'Magia Espacial': '🌀', 'Magia de Metamorfose': '🎭',
    'Magias Arcanas/Negra de 1º Ciclo': '🔮', 'Magias Arcanas/Negra de 2º Ciclo': '🔮', 'Magias Arcanas/Negra de 3º Ciclo': '🔮', 'Magias Arcanas/Negra de 4º Ciclo': '🔮', 'Magias Arcanas/Negra de 5º Ciclo': '🔮', 'Magias Arcanas/Negra de 6º Ciclo': '🔮', 'Magias Arcanas/Negra de 7º Ciclo': '🔮', 'Magias Arcanas/Negra de 8º Ciclo': '🔮', 'Magias Arcanas/Negra de 9º Ciclo': '🔮', 'Magias Arcanas/Negra de 10º Ciclo': '🔮',
    'Magias de 1º Ciclo': '🔄', 'Magias de 2º Ciclo': '🔄', 'Magias de 3º Ciclo': '🔄', 'Magias de 4º Ciclo': '🔄', 'Magias de 5º Ciclo': '🔄', 'Magias de 6º Ciclo': '🔄', 'Magias de 7º Ciclo': '🔄', 'Magias de 8º Ciclo': '🔄', 'Magias de 9º Ciclo': '🔄', 'Magias de 10º Ciclo': '🔄',
    'Elemento Madeira': '🪵', 'Elemento Mineral': '💎', 'Elemento Cinzas': '🌫️', 'Elemento Igneo': '☄️', 'Elemento Lava': '🌋', 'Elemento Vapor': '♨️', 'Elemento Nevoa': '🌫️', 'Elemento Tempestade': '🌩️', 'Elemento Areia': '🏜️', 'Elemento Tufao': '🌪️',
    'Elemento Velocidade': '💨', 'Elemento Poeira': '🔲', 'Elemento Calor': '🌡️', 'Elemento Cal': '⬜', 'Elemento Carbono': '⬛', 'Elemento Veneno': '☣️', 'Elemento Magnetismo': '🧲', 'Elemento Som': '🔊',
    'Truques de Ciclo': '✨', 'Truques Arcanos/Negros': '🔮', 'Truques Ancestrais': '📜',
    'Aura Pura': '✨', 'Projeção de Aura': '🛡️', 'Artes Marciais': '🥋', 'Reforço Físico': '💪', 'Fusões Básicas': '🌀', 'Fusões Avançadas': '⚛️'
};

export const cores = {
    'Fogo': '#ff4d4d', 'Agua': '#4dffff', 'Raio': '#ffff4d', 'Terra': '#d2a679', 'Vento': '#4dff88',
    'Fogo Verdadeiro': '#ff0000', 'Agua Verdadeira': '#00e6e6', 'Raio Verdadeiro': '#ffff00', 'Terra Verdadeira': '#d48846', 'Vento Verdadeiro': '#00ff40',
    'Solar': '#ffb366', 'Solar Verdadeiro': '#ff6600', 'Gelo': '#99ffff', 'Gelo Verdadeiro': '#00ffff', 'Natureza': '#66ff66', 'Natureza Verdadeira': '#00ff00', 'Energia': '#ff66ff', 'Energia Verdadeira': '#ff00ff', 'Vacuo': '#999999', 'Vacuo Verdadeiro': '#ffffff',
    'Luz': '#ffffff', 'Trevas': '#800080', 'Ether': '#b366ff', 'Celestial': '#ffffcc', 'Infernal': '#cc0000', 'Caos': '#ff3399', 'Criacao': '#00ffcc', 'Destruicao': '#8b0000', 'Cosmos': '#4d0099',
    'Vida': '#33ff77', 'Morte': '#4d4d4d', 'Vazio': '#1a1a1a', 'Neutro': '#cccccc',
    'Magia de Osso': '#e6e6e6', 'Magia de Sangue': '#ff0000', 'Magia de Borracha': '#ff99cc', 'Magia de Sal': '#fdfdfd', 'Magia de Alma': '#33cccc', 'Magia de Tremor': '#cc9966', 'Magia de Gravidade': '#6600cc', 'Magia de Equipamento': '#b3b3b3', 'Magia de Tempo': '#ffd700', 'Magia Draconica': '#ff5500', 'Magia de Espelho': '#ccffff', 'Magia de Explosao': '#ff3300', 'Magia Espacial': '#000066', 'Magia de Metamorfose': '#ff66b3',
    'Magias Arcanas/Negra de 1º Ciclo': '#d9b3ff', 'Magias Arcanas/Negra de 2º Ciclo': '#cc99ff', 'Magias Arcanas/Negra de 3º Ciclo': '#bf80ff', 'Magias Arcanas/Negra de 4º Ciclo': '#b366ff', 'Magias Arcanas/Negra de 5º Ciclo': '#a64dff', 'Magias Arcanas/Negra de 6º Ciclo': '#9933ff', 'Magias Arcanas/Negra de 7º Ciclo': '#8c1aff', 'Magias Arcanas/Negra de 8º Ciclo': '#8000ff', 'Magias Arcanas/Negra de 9º Ciclo': '#6600cc', 'Magias Arcanas/Negra de 10º Ciclo': '#4d0099',
    'Magias de 1º Ciclo': '#b3ffe6', 'Magias de 2º Ciclo': '#80ffcc', 'Magias de 3º Ciclo': '#4dffb3', 'Magias de 4º Ciclo': '#1aff99', 'Magias de 5º Ciclo': '#00e68a', 'Magias de 6º Ciclo': '#00cc7a', 'Magias de 7º Ciclo': '#00b36b', 'Magias de 8º Ciclo': '#00995c', 'Magias de 9º Ciclo': '#00804d', 'Magias de 10º Ciclo': '#00663d',
    'Elemento Madeira': '#8b5a2b', 'Elemento Mineral': '#e6e6fa', 'Elemento Cinzas': '#808080', 'Elemento Igneo': '#ff4500', 'Elemento Lava': '#ff0000', 'Elemento Vapor': '#ffb6c1', 'Elemento Nevoa': '#b0e0e6', 'Elemento Tempestade': '#ccccff', 'Elemento Areia': '#f4a460', 'Elemento Tufao': '#98fb98',
    'Elemento Velocidade': '#e6ffff', 'Elemento Poeira': '#d9d9d9', 'Elemento Calor': '#ff6600', 'Elemento Cal': '#e6ccb3', 'Elemento Carbono': '#595959', 'Elemento Veneno': '#9933ff', 'Elemento Magnetismo': '#4169e1', 'Elemento Som': '#a6a6a6',
    'Truques de Ciclo': '#b3ffe6', 'Truques Arcanos/Negros': '#d9b3ff', 'Truques Ancestrais': '#e6e6e6',
    'Aura Pura': '#b366ff', 'Projeção de Aura': '#b366ff', 'Artes Marciais': '#ff3333', 'Reforço Físico': '#ff3333', 'Fusões Básicas': '#ff00ff', 'Fusões Avançadas': '#ff00ff'
};

// Matriz Base de Capítulos (Será expandida dinamicamente)
const ABAS_GRIMORIO_STATIC = {
    'basicos': {
        label: 'Elementos Básicos', icon: '🔥',
        categorias: [
            { titulo: 'A Natureza Base', itens: ['Fogo', 'Raio', 'Vento', 'Agua', 'Terra'] },
            { titulo: 'Neutro (Sem Elemento)', itens: ['Neutro'] }
        ]
    },
    'basicos_verdadeiros': {
        label: 'Básicos Verdadeiros', icon: '🌋',
        categorias: [{ titulo: 'A Natureza Pura e Intocada', itens: ['Fogo Verdadeiro', 'Raio Verdadeiro', 'Agua Verdadeira', 'Vento Verdadeiro', 'Terra Verdadeira'] }]
    },
    'avancados': {
        label: 'Elementos Avançados', icon: '❄️',
        categorias: [{ titulo: 'As Forças Superiores', itens: ['Solar', 'Energia', 'Gelo', 'Vacuo', 'Natureza'] }]
    },
    'avancados_verdadeiros': {
        label: 'Avançados Verdadeiros', icon: '☀️',
        categorias: [{ titulo: 'O Ápice das Forças Superiores', itens: ['Solar Verdadeiro', 'Energia Verdadeira', 'Gelo Verdadeiro', 'Vacuo Verdadeiro', 'Natureza Verdadeira'] }]
    },
    'primordiais': {
        label: 'Elementos Primordiais', icon: '✨',
        categorias: [{ titulo: 'As Essências da Realidade', itens: ['Luz', 'Trevas', 'Ether'] }]
    },
    'primordiais_verdadeiros': {
        label: 'Primordiais Verdadeiros', icon: '🌟',
        categorias: [{ titulo: 'A Divindade e a Ruína', itens: ['Celestial', 'Infernal', 'Caos'] }]
    },
    'absolutos': {
        label: 'Primordiais Absolutos', icon: '♾️',
        categorias: [{ titulo: 'O Início e o Fim de Tudo', itens: ['Criacao', 'Destruicao', 'Cosmos'] }]
    },
    'astrais': { 
        label: 'Elementos Astrais', icon: '🌌', 
        categorias: [{ titulo: 'As Forças Astrais', itens: ['Vida', 'Morte', 'Vazio'] }] 
    },
    'chakra': { 
        label: 'O Chakra', icon: '🌀', 
        categorias: [
            { titulo: 'Kekkei Genkai (Mutações Genéticas)', itens: ['Elemento Madeira', 'Elemento Mineral', 'Elemento Cinzas', 'Elemento Igneo', 'Elemento Lava', 'Elemento Vapor', 'Elemento Nevoa', 'Elemento Tempestade', 'Elemento Areia', 'Elemento Tufao'] },
            { titulo: 'Kekkei Touta (Seleção Sanguínea)', itens: ['Elemento Velocidade', 'Elemento Poeira', 'Elemento Veneno', 'Elemento Cal', 'Elemento Carbono', 'Elemento Calor', 'Elemento Som', 'Elemento Magnetismo'] }
        ] 
    },
    'mana': { 
        label: 'A Mana', icon: '🔮', 
        categorias: [
            { titulo: 'Magias de Ciclo', itens: ['Truques de Ciclo', 'Magias de 1º Ciclo', 'Magias de 2º Ciclo', 'Magias de 3º Ciclo', 'Magias de 4º Ciclo', 'Magias de 5º Ciclo', 'Magias de 6º Ciclo', 'Magias de 7º Ciclo', 'Magias de 8º Ciclo', 'Magias de 9º Ciclo', 'Magias de 10º Ciclo'] },
            { titulo: 'Magias Arcanas e Negras', itens: ['Truques Arcanos/Negros', 'Magias Arcanas/Negra de 1º Ciclo', 'Magias Arcanas/Negra de 2º Ciclo', 'Magias Arcanas/Negra de 3º Ciclo', 'Magias Arcanas/Negra de 4º Ciclo', 'Magias Arcanas/Negra de 5º Ciclo', 'Magias Arcanas/Negra de 6º Ciclo', 'Magias Arcanas/Negra de 7º Ciclo', 'Magias Arcanas/Negra de 8º Ciclo', 'Magias Arcanas/Negra de 9º Ciclo', 'Magias Arcanas/Negra de 10º Ciclo'] },
            { titulo: 'Magias Ancestrais', itens: ['Truques Ancestrais', 'Magia de Sangue', 'Magia de Osso', 'Magia Draconica', 'Magia de Borracha', 'Magia de Espelho', 'Magia de Sal', 'Magia de Alma', 'Magia de Tremor', 'Magia de Gravidade', 'Magia de Tempo', 'Magia de Equipamento', 'Magia de Explosao', 'Magia Espacial', 'Magia de Metamorfose'] }
        ] 
    },
    'aura': { 
        label: 'A Aura', icon: '🛡️', 
        categorias: [{ titulo: 'Manifestações de Aura', itens: ['Aura Pura', 'Projeção de Aura'] }] 
    },
    'corpo': { 
        label: 'O Corpo', icon: '💪', 
        categorias: [{ titulo: 'Técnicas Corporais', itens: ['Artes Marciais', 'Reforço Físico'] }] 
    },
    'compostos': { 
        label: 'Elementos Compostos', icon: '⚛️', 
        categorias: [{ titulo: 'Misturas Elementais', itens: ['Fusões Básicas', 'Fusões Avançadas'] }] 
    }
};

export const BONUS_OPTIONS = [
    { value: 'nenhum', label: 'Nenhum (Apenas Elemento)' },
    { value: 'mult_dano', label: 'Mult Dano' },
    { value: 'dano_bruto', label: 'Dano Bruto' },
    { value: 'letalidade', label: 'Letalidade' },
];

export const NIVEIS_DOMINIO = {
    1: { nome: "Básico", cor: "#44ff44", desc: "+10% Dano" },
    2: { nome: "Intermediário", cor: "#44ff44", desc: "+25% Dano | -5% Custo" },
    3: { nome: "Avançado", cor: "#44ff44", desc: "+50% Dano | -10% Custo" },
    4: { nome: "Virtuoso", cor: "#0088ff", desc: "Dano x2 | Ignora Resistências Menores" },
    5: { nome: "Maestria", cor: "#0088ff", desc: "Dano x3.5 | -25% Custo | -50% Dano Sofrido" },
    6: { nome: "Perfeito", cor: "#0088ff", desc: "Dano x6 | Imunidade Total | Incancelável" },
    7: { nome: "Molecular", cor: "#aa00ff", desc: "Dano x10 | Ignora Imunidades | Dano Persistente" },
    8: { nome: "Atômico", cor: "#aa00ff", desc: "Dano x50 | -50% Custo | Desintegração de Armadura" },
    9: { nome: "Absoluto", cor: "#ff003c", desc: "Dano x100 | Custo ZERO | Silenciamento de Elemento" },
    10: { nome: "Eterno", cor: "#ffcc00", desc: "Dano Incalculável | Apagamento Conceitual" }
};

const ElementosFormContext = createContext(null);

export function useElementosForm() {
    const ctx = useContext(ElementosFormContext);
    if (!ctx) return null; 
    return ctx;
}

export function ElementosFormProvider({ children }) {
    const minhaFicha = useStore(s => s.minhaFicha);
    const meuNome = useStore(s => s.meuNome);
    const updateFicha = useStore(s => s.updateFicha);
    const setAbaAtiva = useStore(s => s.setAbaAtiva);
    
    const elemEditandoId = useStore(s => s.elemEditandoId);
    const setElemEditandoId = useStore(s => s.setElemEditandoId);

    const [abaAtual, setAbaAtual] = useState('basicos'); 
    const [elemSelecionado, setElemSelecionado] = useState('Neutro');
    const [nomeElem, setNomeElem] = useState('');
    const [descricaoElem, setDescricaoElem] = useState(''); 
    const [elementosAfetados, setElementosAfetados] = useState('');
    const [bonusTipo, setBonusTipo] = useState('nenhum');
    const [bonusValor, setBonusValor] = useState('');
    const [custoValor, setCustoValor] = useState(0);
    const [dadosQtd, setDadosQtd] = useState(0);
    const [dadosFaces, setDadosFaces] = useState(20);
    
    const [energiaCombustao, setEnergiaCombustao] = useState('flexivel');
    const [tipoMecanica, setTipoMecanica] = useState('ataque'); 
    const [savingAttr, setSavingAttr] = useState('destreza'); 
    const [alcanceQuad, setAlcanceQuad] = useState(1);
    
    const [areaQuad, setAreaQuad] = useState(0);
    const [alvosAfetados, setAlvosAfetados] = useState('todos'); 
    const [duracaoZona, setDuracaoZona] = useState(0); 

    const formRef = useRef(null);
    const profGlobal = parseInt(minhaFicha?.proficienciaBase) || 2;

    // 🔥 CORREÇÃO: recebia o valor CRU de `ficha[attr]?.base` e extraía os 2 primeiros dígitos "na
    // unha" (substring) -- igual ao mesmo bug já corrigido em combate/TestesFormContext.jsx, isso
    // (a) nunca somava o bônus oculto de Ascensão que a rolagem REAL de Acerto usa (core/engine.js
    // > calcularAcerto/getPoderDeLutaStatus), fazendo o CD/Acerto exibido no card da magia divergir
    // do que a rolagem real produz; e (b) divergia numericamente do algoritmo canônico pra valores
    // de 3+ dígitos (core/utils.js > pegarDoisPrimeirosDigitos usa n/1000 acima de 1000, não os 2
    // primeiros caracteres da string).
    const getModificadorDoisDigitos = useCallback((attrKey) => {
        return pegarDoisPrimeirosDigitos(getPoderDeLutaStatus(minhaFicha, attrKey, true));
    }, [minhaFicha]);

    // 🔥 O MOTOR DE CAPÍTULOS DINÂMICOS (Adiciona os Customizados pelo Jogador) 🔥
    const abasDinamicas = useMemo(() => {
        const base = JSON.parse(JSON.stringify(ABAS_GRIMORIO_STATIC)); // Deep Copy para não estragar a original
        const custom = minhaFicha?.elementosCustomizados || {};

        // Injeta as criações nas respetivas abas
        for (const abaKey in custom) {
            if (base[abaKey]) {
                base[abaKey].categorias.push({
                    titulo: 'Conhecimentos Forjados por Mim',
                    itens: custom[abaKey]
                });
            }
        }

        // Recupera elementos extras não categorizados no código ou magias abandonadas da ficha
        const itensJáCategorizados = Object.values(base).flatMap(aba => aba.categorias.flatMap(c => c.itens));
        const magiasSobressalentes = Object.keys(cores).filter(k => !itensJáCategorizados.includes(k));
        const elementosNasMagias = (minhaFicha?.ataquesElementais || []).map(m => m.elemento).filter(Boolean);
        
        const extraFinal = [...new Set([...magiasSobressalentes, ...elementosNasMagias])]
            .filter(k => !itensJáCategorizados.includes(k) && k !== 'Neutro');

        if (extraFinal.length > 0) {
            base['extras'] = {
                label: 'Pergaminhos Perdidos', icon: '📜',
                categorias: [{ titulo: 'Magias Desconhecidas', itens: extraFinal }]
            };
        }

        return base;
    }, [minhaFicha?.elementosCustomizados, minhaFicha?.ataquesElementais]);

    // 🔥 CRIAR NOVO ELEMENTO E SALVAR NO FIREBASE 🔥
    const criarElementoCustomizado = useCallback((nome) => {
        if (!nome || !nome.trim()) return;
        const nForm = nome.trim();
        updateFicha(f => {
            if (!f.elementosCustomizados) f.elementosCustomizados = {};
            if (!f.elementosCustomizados[abaAtual]) f.elementosCustomizados[abaAtual] = [];
            if (!f.elementosCustomizados[abaAtual].includes(nForm)) {
                f.elementosCustomizados[abaAtual].push(nForm);
            }
        });
        salvarFichaSilencioso();
        setElemSelecionado(nForm);
    }, [abaAtual, updateFicha, setElemSelecionado]);

    // Lógicas de inatos e combustão...
    const elementosInatos = useMemo(() => {
        if (!minhaFicha) return [];
        const inatos = [];

        const lerInatosDosEfeitos = (efeitos) => {
            if (!efeitos) return;
            efeitos.forEach(ef => {
                if (ef && ef.propriedade === 'elemento_inato' && ef.nome) {
                    ef.nome.split(',').forEach(n => inatos.push(n.toLowerCase().trim()));
                }
            });
        };

        if (minhaFicha.poderes) {
            minhaFicha.poderes.forEach(p => {
                if (p.ativa) {
                    if ((p.vertente || '').toLowerCase().includes('elemental') && p.elemento) {
                        inatos.push(p.elemento.toLowerCase().trim());
                    }
                    lerInatosDosEfeitos(p.efeitos);
                    if (p.formaAtivaId && p.formas) {
                        const f = p.formas.find(x => x.id === p.formaAtivaId);
                        if (f) {
                            lerInatosDosEfeitos(f.efeitos);
                            if (f.configAtivaId && f.configs) {
                                const c = f.configs.find(x => x.id === f.configAtivaId);
                                if (c) lerInatosDosEfeitos(c.efeitos);
                            }
                        }
                    }
                }
                lerInatosDosEfeitos(p.efeitosPassivos);
            });
        }

        const h = minhaFicha.hierarquia || {};
        if (h.poder && (h.poderVertente || '').toLowerCase().includes('elemental') && h.poderElemento) {
            inatos.push(h.poderElemento.toLowerCase().trim());
        }
        if (h.infinity && (h.infinityVertente || '').toLowerCase().includes('elemental') && h.infinityElemento) {
            inatos.push(h.infinityElemento.toLowerCase().trim());
        }

        if (minhaFicha.seresSelados) {
            minhaFicha.seresSelados.forEach(s => {
                if (s.ativo) {
                    if (s.elemento && s.zeraCusto) {
                        inatos.push(s.elemento.toLowerCase().trim());
                    }
                    lerInatosDosEfeitos(s.efeitos);
                    if (s.formaAtivaId && s.formas) {
                        const f = s.formas.find(x => x.id === s.formaAtivaId);
                        if (f) {
                            lerInatosDosEfeitos(f.efeitos);
                            if (f.configAtivaId && f.configs) {
                                const c = f.configs.find(x => x.id === f.configAtivaId);
                                if (c) lerInatosDosEfeitos(c.efeitos);
                            }
                        }
                    }
                }
                lerInatosDosEfeitos(s.efeitosPassivos);
            });
        }
        
        if (minhaFicha.inventario) {
            minhaFicha.inventario.forEach(item => {
                if (item.equipado) {
                    lerInatosDosEfeitos(item.efeitos);
                    lerInatosDosEfeitos(item.efeitosPassivos);
                }
            });
        }

        return inatos;
    }, [minhaFicha?.poderes, minhaFicha?.hierarquia, minhaFicha?.seresSelados, minhaFicha?.inventario]);

    const allowedEnergies = useMemo(() => {
        let opts = [];
        const isArcana = elemSelecionado.includes('Arcanas/Negra');
        const isTruque = elemSelecionado.includes('Truque');

        if (isArcana) {
            opts = [
                { value: 'flexivel', label: 'Flexível (Escolher)' },
                { value: 'mana', label: 'Mana (Base: Int)' }, { value: 'aura', label: 'Aura (Base: Eng)' }, { value: 'chakra', label: 'Chakra (Base: Sta)' },
                { value: 'corpo', label: 'Corpo (Base: For/Des)' }, { value: 'pontosVitais', label: 'Pts. Vitais (Const)' }, { value: 'pontosMortais', label: 'Pts. Mortais (Int)' },
                { value: 'livre', label: 'Livre' }
            ];
        } else if (isTruque) {
            opts = [{ value: 'livre', label: 'Livre' }];
        } else if (abaAtual === 'astrais') {
            opts = [{ value: 'pontosVitais', label: 'Pts. Vitais' }, { value: 'pontosMortais', label: 'Pts. Mortais' }];
        } else if (abaAtual === 'chakra') { opts = [{ value: 'chakra', label: 'Chakra' }];
        } else if (abaAtual === 'aura') { opts = [{ value: 'aura', label: 'Aura' }];
        } else if (abaAtual === 'corpo') { opts = [{ value: 'corpo', label: 'Corpo' }];
        } else if (abaAtual === 'mana') { opts = [{ value: 'mana', label: 'Mana' }];
        } else {
            opts = [
                { value: 'flexivel', label: 'Flexível' },
                { value: 'mana', label: 'Mana' }, { value: 'aura', label: 'Aura' }, { value: 'chakra', label: 'Chakra' }
            ];
        }

        if (elemEditandoId && !opts.some(o => o.value === energiaCombustao)) {
            opts.push({ value: energiaCombustao, label: `${energiaCombustao} (Forçado)` });
        }
        return opts;
    }, [abaAtual, elemSelecionado, elemEditandoId, energiaCombustao]);

    const selecionarElemento = useCallback((nome) => {
        setElemSelecionado(nome);
        if (nome.includes('Truque')) setEnergiaCombustao('livre');
        else if (nome.includes('Arcanas/Negra')) setEnergiaCombustao('flexivel'); 
        else if (abaAtual === 'chakra') setEnergiaCombustao('chakra');
        else if (abaAtual === 'mana') setEnergiaCombustao('mana');
        else if (abaAtual === 'aura') setEnergiaCombustao('aura');
        else if (abaAtual === 'corpo') setEnergiaCombustao('corpo');
        else if (abaAtual === 'astrais') setEnergiaCombustao('pontosVitais');
        else setEnergiaCombustao('flexivel'); 
    }, [abaAtual]);

    const cancelarEdicaoElem = useCallback(() => {
        setElemEditandoId(null); setNomeElem(''); setDescricaoElem(''); 
        setElementosAfetados(''); 
        const abasFlexiveis = ['basicos', 'basicos_verdadeiros', 'avancados', 'avancados_verdadeiros', 'primordiais', 'primordiais_verdadeiros', 'absolutos', 'compostos'];
        setEnergiaCombustao(abasFlexiveis.includes(abaAtual) ? 'flexivel' : 'mana');
        setTipoMecanica('ataque'); setAlcanceQuad(1); setAreaQuad(0);
        setAlvosAfetados('todos'); setDuracaoZona(0);
    }, [setElemEditandoId, abaAtual]);

    const salvarNovoElem = useCallback(() => {
        const n = nomeElem.trim();
        if (!n) { alert('Sua magia precisa de um nome, Arcano!'); return; }
        updateFicha((ficha) => {
            if (!ficha.ataquesElementais) ficha.ataquesElementais = [];
            const novaMagia = {
                nome: n, descricao: descricaoElem, elemento: elemSelecionado, elementosAfetados, 
                bonusTipo, bonusValor, custoValor: parseFloat(custoValor) || 0, 
                dadosExtraQtd: parseInt(dadosQtd) || 0, dadosExtraFaces: parseInt(dadosFaces) || 20,
                energiaCombustao, tipoMecanica, savingAttr, alcanceQuad: parseFloat(alcanceQuad) || 1, 
                areaQuad: parseFloat(areaQuad) || 0, alvosAfetados, duracaoZona: parseInt(duracaoZona) || 0,
                equipado: false
            };
            if (elemEditandoId) {
                const ix = ficha.ataquesElementais.findIndex(i => i.id === elemEditandoId);
                if (ix !== -1) {
                    novaMagia.id = ficha.ataquesElementais[ix].id;
                    novaMagia.equipado = ficha.ataquesElementais[ix].equipado;
                    ficha.ataquesElementais[ix] = novaMagia;
                }
            } else {
                novaMagia.id = Date.now();
                ficha.ataquesElementais.push(novaMagia);
            }
        });
        cancelarEdicaoElem();
        salvarFichaSilencioso();
    }, [nomeElem, descricaoElem, elemSelecionado, elementosAfetados, bonusTipo, bonusValor, custoValor, dadosQtd, dadosFaces, energiaCombustao, tipoMecanica, savingAttr, alcanceQuad, areaQuad, alvosAfetados, duracaoZona, elemEditandoId, updateFicha, cancelarEdicaoElem]);

    const editarElem = useCallback((id) => {
        const p = (minhaFicha.ataquesElementais || []).find(i => i.id === id);
        if (!p) return;
        if (p.equipado) {
            updateFicha(f => {
                const idx = f.ataquesElementais.findIndex(i => i.id === id);
                if (idx !== -1) f.ataquesElementais[idx].equipado = false;
            });
            salvarFichaSilencioso();
            alert(`O pergaminho de [${p.nome}] foi DESMEMORIZADO para edição.`);
        }
        const el = p.elemento || 'Neutro';
        setElemSelecionado(el);
        let foundAba = 'basicos';
        for (const [abaKey, abaData] of Object.entries(abasDinamicas)) {
            if (abaData.categorias.some(cat => cat.itens.includes(el))) {
                foundAba = abaKey;
                break;
            }
        }
        setAbaAtual(foundAba);
        setElemEditandoId(p.id); setNomeElem(p.nome); setDescricaoElem(p.descricao || ''); setElementosAfetados(p.elementosAfetados || ''); 
        setBonusTipo(p.bonusTipo || 'nenhum'); setBonusValor(p.bonusValor || ''); setCustoValor(p.custoValor || 0); 
        setDadosQtd(p.dadosExtraQtd || 0); setDadosFaces(p.dadosExtraFaces || 20); 
        setEnergiaCombustao(p.energiaCombustao || 'mana'); setTipoMecanica(p.tipoMecanica || 'ataque'); 
        setSavingAttr(p.savingAttr || 'destreza'); setAlcanceQuad(p.alcanceQuad || 1); 
        setAreaQuad(p.areaQuad || 0); setAlvosAfetados(p.alvosAfetados || 'todos'); setDuracaoZona(p.duracaoZona || 0);

        if (formRef.current) formRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [minhaFicha.ataquesElementais, setElemEditandoId, updateFicha, abasDinamicas]);

    const toggleEquiparElem = useCallback((id) => {
        updateFicha((ficha) => {
            if (!ficha.ataquesElementais) return;
            const itemIndex = ficha.ataquesElementais.findIndex(i => i.id === id);
            if (itemIndex !== -1) ficha.ataquesElementais[itemIndex].equipado = !ficha.ataquesElementais[itemIndex].equipado;
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const deletarElem = useCallback((id) => {
        if (!window.confirm('Rasgar esta página do Grimório para sempre?')) return;
        updateFicha((ficha) => { ficha.ataquesElementais = (ficha.ataquesElementais || []).filter(i => i.id !== id); });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const conjurarMagia = useCallback((magia, energiaOverride = null) => {
        enviarParaFeed({ tipo: 'sistema', nome: meuNome, texto: `Atenção: A conjuração direta pelo Grimório foi desativada. Equipe a magia e use o painel principal!` });
        setAbaAtiva('aba-ataque');
    }, [meuNome, setAbaAtiva]);

    const injetarJsonDaIA = useCallback((jsonString) => {
        try {
            const dados = JSON.parse(jsonString);
            let countE = 0;
            updateFicha(f => {
                const time = Date.now();
                if (dados.ataquesElementais && Array.isArray(dados.ataquesElementais)) {
                    if (!f.ataquesElementais) f.ataquesElementais = [];
                    dados.ataquesElementais.forEach((el, i) => {
                        f.ataquesElementais.push({
                            id: 'ia_el_' + time + i,
                            nome: el.nome || 'Magia sem Nome',
                            descricao: el.descricao || '',
                            elemento: el.elemento || elemSelecionado, 
                            elementosAfetados: el.elementosAfetados || '',
                            dadosExtraQtd: parseInt(el.danoQtd) || 0,
                            dadosExtraFaces: parseInt(el.danoFaces) || 0,
                            custoValor: parseFloat(el.custoPercentual) || 0,
                            energiaCombustao: el.energiaCombustao || 'mana',
                            tipoMecanica: el.tipoMecanica || 'ataque',
                            savingAttr: el.savingAttr || 'destreza',
                            alcanceQuad: parseFloat(el.alcance) || 1,
                            areaQuad: parseFloat(el.area) || 0,
                            alvosAfetados: 'todos',
                            duracaoZona: 0,
                            bonusTipo: 'nenhum',
                            equipado: false,
                            notasIA: el.notasIA || ''
                        });
                        countE++;
                    });
                }
            });
            salvarFichaSilencioso();
            alert(`Grimório Atualizado!\n\n🌪️ Foram inscritos ${countE} novos pergaminhos mágicos com sucesso.`);
            return true;
        } catch (e) {
            console.error(e);
            alert("Erro no código da IA. Certifique-se de copiar o JSON completo.");
            return false;
        }
    }, [updateFicha, elemSelecionado]);

    const ataquesElementais = minhaFicha.ataquesElementais || [];
    const magiasDoGrupo = useMemo(() => ataquesElementais.filter(e => (e.elemento || 'Neutro') === elemSelecionado), [ataquesElementais, elemSelecionado]);
    const magiasConjuradasOutros = useMemo(() => ataquesElementais.filter(e => e.equipado && (e.elemento || 'Neutro') !== elemSelecionado), [ataquesElementais, elemSelecionado]);

    const value = useMemo(() => ({
        abaAtual, setAbaAtual, elemSelecionado, setElemSelecionado,
        nomeElem, setNomeElem, descricaoElem, setDescricaoElem, elementosAfetados, setElementosAfetados, 
        bonusTipo, setBonusTipo, bonusValor, setBonusValor,
        custoValor, setCustoValor, dadosQtd, setDadosQtd, dadosFaces, setDadosFaces,
        energiaCombustao, setEnergiaCombustao, tipoMecanica, setTipoMecanica,
        savingAttr, setSavingAttr, alcanceQuad, setAlcanceQuad, areaQuad, setAreaQuad,
        alvosAfetados, setAlvosAfetados, duracaoZona, setDuracaoZona,
        formRef, profGlobal, getModificadorDoisDigitos, allowedEnergies,
        selecionarElemento, salvarNovoElem, editarElem, cancelarEdicaoElem, toggleEquiparElem,
        deletarElem, conjurarMagia, magiasDoGrupo, magiasConjuradasOutros, elemEditandoId, minhaFicha,
        elementosInatos, injetarJsonDaIA, abasDinamicas, criarElementoCustomizado 
    }), [
        abaAtual, elemSelecionado, nomeElem, descricaoElem, elementosAfetados, bonusTipo, bonusValor, custoValor, dadosQtd, dadosFaces,
        energiaCombustao, tipoMecanica, savingAttr, alcanceQuad, areaQuad, alvosAfetados, duracaoZona, profGlobal, getModificadorDoisDigitos, allowedEnergies,
        selecionarElemento, salvarNovoElem, editarElem, cancelarEdicaoElem, toggleEquiparElem, deletarElem, conjurarMagia, magiasDoGrupo, magiasConjuradasOutros, elemEditandoId, minhaFicha, elementosInatos, injetarJsonDaIA, abasDinamicas, criarElementoCustomizado
    ]);

    return <ElementosFormContext.Provider value={value}>{children}</ElementosFormContext.Provider>;
}