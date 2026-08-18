import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export const fichaPadrao = {
    donoDaFicha: "", // 🔥 O CARIMBO DE PROPRIEDADE NA NUVEM 🔥
    ascensaoBase: 1, poderes: [], inventario: [], ataquesElementais: [], passivas: [], seresSelados: [],
    
    // 🔥 NOVO: Estruturas do Novo Grimório 🔥
    habilidades: [], formas: [], esteticaGrimorio: {},
    
    hierarquia: { poder: false, infinity: false, singularidade: '', poderNome: '', poderDesc: '', infinityNome: '', infinityDesc: '', singularidadeNome: '', singularidadeDesc: '' },
    proficienciaBase: 2, proficiencias: {}, avatar: { base: "" },
    
    // 🔥 NOVO: Adicionado "apelido" e "nivel" na Bio
    bio: { raca: "", classe: "", idade: "", fisico: "", sangue: "", alinhamento: "", afiliacao: "", dinheiro: "", apelido: "", nivel: 0 },
    
    // 🔥 NOVO: Matriz de Afinidades Elementais e Condições (Stacks)
    afinidades: { resistencias: [], vulnerabilidades: [], imunidades: [], absorcoes: [] },
    condicoes: [], 
    
    notas: { base: "", geral: "", abs: "" }, posicao: { x: 0, y: 0, z: 0 }, iniciativa: 0,
    acoes: { padrao: { max: 1, atual: 1 }, bonus: { max: 1, atual: 1 }, reacao: { max: 1, atual: 1 } },
    ataqueConfig: { armaStatusUsados: ['forca'], armaEnergiaCombustao: 'mana', armaPercEnergia: 0, criticoNormalMin: 16, criticoNormalMax: 18, criticoFatalMin: 19, criticoFatalMax: 20, vantagens: 0, desvantagens: 0 },
    dano: { base: 0, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: "1.0", mAbsoluto: 1.0, mPotencial: 1.0, reducaoCusto: 0, regeneracao: 0 },
    divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
    vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: "1.0", mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0, atual: 100000000 },
    inteligencia: { base: 100000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: "1.0", mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 },
    sabedoria: { base: 100000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: "1.0", mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 },
    energiaEsp: { base: 100000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: "1.0", mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 },
    carisma: { base: 100000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: "1.0", mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 },
    stamina: { base: 100000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: "1.0", mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 },
    constituicao: { base: 100000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: "1.0", mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 },
    forca: { base: 100000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: "1.0", mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 },
    destreza: { base: 100000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: "1.0", mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 },
    mana: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: "1.0", mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0, atual: 100000000 },
    aura: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: "1.0", mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0, atual: 100000000 },
    chakra: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: "1.0", mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0, atual: 100000000 },
    corpo: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: "1.0", mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0, atual: 100000000 },
    compendioOverrides: {}, cores: {},
    dominios: { elementais: {}, elementos: {}, mana: {}, chakra: {}, aura: {}, astral: {}, primordiais: {}, marciais: {}, armas: {}, cura: {}, summons: {} },
    
    // 🔥 NOVOS CAMPOS DA NOVA FICHA (Evita Amnésia no F5) 🔥
    estetica: {}, labels: {}, pv: { atual: 0 }, pm: { atual: 0 }, multiplicadorVida: 1, multiplicadorMorte: 1, multiplicadorForca: 1,

    // 🔥 NOVO: 5ª barra de energia — "Força". O valor atual é independente das outras
    // energias; o máximo é sempre derivado (média de mana/aura/chakra/corpo), nunca
    // armazenado aqui — ver getSupremas() em Marcados.jsx
    energiaForca: { atual: 0 }
};

export function sanitizarNome(n) { return !n ? '' : n.replace(/[.#$\[\]\/]/g, '_').trim(); }
function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

const storedMesaId = localStorage.getItem('rpg_mesaId') || '';

const useStore = create(
    immer((set, get) => ({
        userLogado: null,
        setUserLogado: (nome) => set(state => { state.userLogado = nome; }),

        jogadoresOnline: [],
        setJogadoresOnline: (lista) => set(state => { state.jogadoresOnline = lista; }),

        mesaCriador: '',
        mesaMestres: {},
        setMesaInfo: (criador, mestresMap) => set(state => {
            state.mesaCriador = criador || '';
            state.mesaMestres = mestresMap || {};
        }),

        mesaId: storedMesaId,
        setMesaId: (id) => set(state => {
            state.mesaId = id;
            if (id) localStorage.setItem('rpg_mesaId', id);
            else localStorage.removeItem('rpg_mesaId');
        }),
        minhaFicha: deepClone(fichaPadrao),
        meuNome: '', isMestre: false, abaAtiva: 'aba-ficha', personagens: {}, feedCombate: [],
        efeitosTemp: [], efeitosTempPassivos: [], efeitosTempArsenal: [], efeitosTempPassivosArsenal: [], efeitosTempForma: [], efeitosTempPassivosForma: [],
        formaEditandoId: null, poderEditandoId: null, itemEditandoId: null, elemEditandoId: null, personagemParaDeletar: '',
        dummies: {}, alvoSelecionado: null,
        cenario: { ativa: 'default', lista: { default: { nome: 'Cenário Inicial', img: '', escala: 1.5, unidade: 'm' } } },

        setMinhaFicha: (ficha) => set((state) => { state.minhaFicha = ficha; }),
        setMeuNome: (nome) => set((state) => { state.meuNome = nome; }),
        setIsMestre: (val) => set((state) => { state.isMestre = val; }),
        setEfeitosTemp: (efeitos) => set((state) => { state.efeitosTemp = efeitos; }),
        setEfeitosTempPassivos: (efeitos) => set((state) => { state.efeitosTempPassivos = efeitos; }),
        setEfeitosTempArsenal: (efeitos) => set((state) => { state.efeitosTempArsenal = efeitos; }),
        setEfeitosTempPassivosArsenal: (efeitos) => set((state) => { state.efeitosTempPassivosArsenal = efeitos; }),
        setEfeitosTempForma: (efeitos) => set((state) => { state.efeitosTempForma = efeitos; }),
        setEfeitosTempPassivosForma: (efeitos) => set((state) => { state.efeitosTempPassivosForma = efeitos; }),
        setFormaEditandoId: (id) => set((state) => { state.formaEditandoId = id; }),
        setPoderEditandoId: (id) => set((state) => { state.poderEditandoId = id; }),
        setItemEditandoId: (id) => set((state) => { state.itemEditandoId = id; }),
        setElemEditandoId: (id) => set((state) => { state.elemEditandoId = id; }),
        setPersonagemParaDeletar: (nome) => set((state) => { state.personagemParaDeletar = nome; }),
        setAbaAtiva: (aba) => set((state) => { state.abaAtiva = aba; }),
        setPersonagens: (personagens) => set((state) => { state.personagens = personagens; }),
        addFeedEntry: (entry) => set((state) => { state.feedCombate.push(entry); }),
        limparFeedStore: () => set(state => { state.feedCombate = []; }),
        setDummies: (dummies) => set((state) => { state.dummies = dummies || {}; }),
        setAlvoSelecionado: (id) => set((state) => { state.alvoSelecionado = id; }),
        setCenario: (dados) => set((state) => { state.cenario = dados; }),
        updateFicha: (callback) => set((state) => { callback(state.minhaFicha); }),

        carregarDadosFicha: (dados) => set((state) => {
            if (!dados) return;
            const chaves = Object.keys(fichaPadrao);
            
            // 🔥 NOVO: Reconhecimento imediato do dono
            if (dados.donoDaFicha !== undefined) state.minhaFicha.donoDaFicha = dados.donoDaFicha;
            
            if (dados.ascensaoBase !== undefined) state.minhaFicha.ascensaoBase = parseInt(dados.ascensaoBase) || 1;
            if (dados.iniciativa !== undefined) state.minhaFicha.iniciativa = parseInt(dados.iniciativa) || 0;
            if (dados.proficienciaBase !== undefined) state.minhaFicha.proficienciaBase = parseInt(dados.proficienciaBase) || 0;
            if (dados.proficiencias !== undefined) state.minhaFicha.proficiencias = dados.proficiencias || {};
            if (dados.divisores) state.minhaFicha.divisores = Object.assign({}, fichaPadrao.divisores, dados.divisores);
            if (dados.ataqueConfig) state.minhaFicha.ataqueConfig = Object.assign({}, fichaPadrao.ataqueConfig, dados.ataqueConfig);
            if (dados.avatar) state.minhaFicha.avatar = Object.assign({}, fichaPadrao.avatar, dados.avatar);
            else state.minhaFicha.avatar = { base: "" };
            if (dados.bio) state.minhaFicha.bio = Object.assign({}, fichaPadrao.bio, dados.bio);
            
            // 🔥 NOVO: Carregar Afinidades e Condições do Firebase
            if (dados.afinidades) state.minhaFicha.afinidades = Object.assign({}, fichaPadrao.afinidades, dados.afinidades);
            if (dados.condicoes) state.minhaFicha.condicoes = dados.condicoes || [];

            // 🔥 NOVO: Carregar Estética e Variáveis da Nova Ficha
            if (dados.estetica) state.minhaFicha.estetica = Object.assign({}, fichaPadrao.estetica, dados.estetica);
            if (dados.labels) state.minhaFicha.labels = Object.assign({}, fichaPadrao.labels, dados.labels);
            if (dados.pv) state.minhaFicha.pv = Object.assign({}, fichaPadrao.pv, dados.pv);
            if (dados.pm) state.minhaFicha.pm = Object.assign({}, fichaPadrao.pm, dados.pm);
            if (dados.multiplicadorVida !== undefined) state.minhaFicha.multiplicadorVida = parseFloat(dados.multiplicadorVida) || 1;
            if (dados.multiplicadorMorte !== undefined) state.minhaFicha.multiplicadorMorte = parseFloat(dados.multiplicadorMorte) || 1;
            if (dados.multiplicadorForca !== undefined) state.minhaFicha.multiplicadorForca = parseFloat(dados.multiplicadorForca) || 1;

            // 🔥 NOVO: Carregar Estilo do Grimório e Listas Novas
            if (dados.esteticaGrimorio) state.minhaFicha.esteticaGrimorio = Object.assign({}, fichaPadrao.esteticaGrimorio, dados.esteticaGrimorio);
            state.minhaFicha.habilidades = dados.habilidades || [];
            state.minhaFicha.formas = dados.formas || [];

            if (dados.notas) state.minhaFicha.notas = Object.assign({}, fichaPadrao.notas, dados.notas);
            if (dados.posicao) state.minhaFicha.posicao = Object.assign({}, fichaPadrao.posicao, dados.posicao);
            state.minhaFicha.inventario = dados.inventario || [];
            state.minhaFicha.poderes = dados.poderes || [];
            state.minhaFicha.ataquesElementais = dados.ataquesElementais || [];
            state.minhaFicha.passivas = dados.passivas || [];
            state.minhaFicha.seresSelados = dados.seresSelados || []; 
            if (dados.hierarquia != null) state.minhaFicha.hierarquia = Object.assign({}, fichaPadrao.hierarquia, dados.hierarquia);
            if (dados.cores !== undefined) state.minhaFicha.cores = Object.assign({}, fichaPadrao.cores, dados.cores || {});
            
            if (dados.dominios) {
                state.minhaFicha.dominios = deepClone(fichaPadrao.dominios);
                Object.assign(state.minhaFicha.dominios, dados.dominios);
            } else {
                state.minhaFicha.dominios = deepClone(fichaPadrao.dominios);
            }

            if (dados.acoes) {
                state.minhaFicha.acoes = {
                    padrao: Object.assign({}, fichaPadrao.acoes.padrao, dados.acoes.padrao),
                    bonus: Object.assign({}, fichaPadrao.acoes.bonus, dados.acoes.bonus),
                    reacao: Object.assign({}, fichaPadrao.acoes.reacao, dados.acoes.reacao)
                };
            } else { state.minhaFicha.acoes = JSON.parse(JSON.stringify(fichaPadrao.acoes)); }

            for (let i = 0; i < chaves.length; i++) {
                const ch = chaves[i];
                // 🔥 NOVO: Ignorar as novas chaves no loop genérico para evitar sobreposição
                if (dados[ch] !== undefined && ch !== 'esteticaGrimorio' && ch !== 'habilidades' && ch !== 'formas' && ch !== 'donoDaFicha' && ch !== 'ascensaoBase' && ch !== 'poderes' && ch !== 'divisores' && ch !== 'inventario' && ch !== 'ataquesElementais' && ch !== 'ataqueConfig' && ch !== 'avatar' && ch !== 'bio' && ch !== 'afinidades' && ch !== 'condicoes' && ch !== 'notas' && ch !== 'passivas' && ch !== 'seresSelados' && ch !== 'posicao' && ch !== 'iniciativa' && ch !== 'acoes' && ch !== 'proficienciaBase' && ch !== 'proficiencias' && ch !== 'cores' && ch !== 'hierarquia' && ch !== 'dominios' && ch !== 'estetica' && ch !== 'labels' && ch !== 'pv' && ch !== 'pm' && ch !== 'multiplicadorVida' && ch !== 'multiplicadorMorte' && ch !== 'multiplicadorForca') {
                    if (typeof fichaPadrao[ch] === 'object' && !Array.isArray(fichaPadrao[ch])) {
                        state.minhaFicha[ch] = Object.assign({}, fichaPadrao[ch], dados[ch]);
                        const numF = ['base', 'mBase', 'mGeral', 'mFormas', 'mAbsoluto', 'reducaoCusto', 'regeneracao', 'atual'];
                        for (let j = 0; j < numF.length; j++) { if (state.minhaFicha[ch][numF[j]] == null || isNaN(state.minhaFicha[ch][numF[j]])) { state.minhaFicha[ch][numF[j]] = fichaPadrao[ch][numF[j]]; } }
                    } else { state.minhaFicha[ch] = dados[ch]; }
                }
            }
        }),

        importarDaAbaStatus: (textoBruto) => set((state) => {
            const extrairNumero = (regex) => {
                const match = textoBruto.match(regex);
                return match ? parseInt(match[1].replace(/\D/g, ''), 10) : null;
            };

            const mapaAtributos = {
                'Força': 'forca',
                'Destreza': 'destreza',
                'Stamina': 'stamina',
                'Constituição': 'constituicao',
                'Energia Espiritual': 'energiaEsp',
                'Presença': 'carisma',
                'Sabedoria': 'sabedoria',
                'Poder mágico': 'inteligencia'
            };

            ['Vida', 'Mana', 'Aura', 'Chakra', 'Corpo'].forEach(campo => {
                const regex = new RegExp(`${campo}:\\s*([\\d\\.]+)`, 'i');
                const valor = extrairNumero(regex);
                if (valor !== null) {
                    const key = campo.toLowerCase();
                    if (!state.minhaFicha[key]) state.minhaFicha[key] = {};
                    state.minhaFicha[key].base = valor;
                    state.minhaFicha[key].atual = valor;
                }
            });

            Object.entries(mapaAtributos).forEach(([textoDoc, chaveStore]) => {
                const regex = new RegExp(`${textoDoc}\\s*=\\s*\\(\\+?([\\d\\.]+)\\)`, 'i');
                const valor = extrairNumero(regex);
                if (valor !== null) {
                    if (!state.minhaFicha[chaveStore]) state.minhaFicha[chaveStore] = {};
                    state.minhaFicha[chaveStore].base = valor;
                }
            });

            console.log("✅ Importação de Status concluída com sucesso!");
        }),

        resetFicha: () => set((state) => { state.minhaFicha = deepClone(fichaPadrao); }),
    }))
);
export default useStore;