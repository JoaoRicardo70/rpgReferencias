import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { migrarPassivasParaPoderes } from '../core/utils.js';

export const fichaPadrao = {
    donoDaFicha: "", 
    ascensaoBase: 1, poderes: [], inventario: [], ataquesElementais: [], passivas: [], seresSelados: [],
    
    habilidades: [], formas: [], esteticaGrimorio: {},
    
    // 🔥 A CURA DA AMNÉSIA: O Store agora sabe que a Arma Espiritual existe desde o berço!
    armaEspiritual: {
        nome: '', epiteto: '', cantico: '', danoBase: '',
        avatarHumano: '', avatarArma: '',
        passivas: [], runas: [], formas: [], formasVerdadeiras: [],
        // 🔥 Estados da Arma Espiritual (Base / Forma Verdadeira / Fantasma Nobre): passivasVerdadeira/
        // runasVerdadeira e passivasFantasma/runasFantasma são os buffs PRÓPRIOS de cada estado
        // superior (excludentes entre si -- ver getGlobalMultipliers em core/poder.js e Marcados.jsx).
        // acessoVerdadeira nasce liberado (progressão comum) e acessoFantasma nasce travado (ápice,
        // só pra poucos) -- o Mestre/Co-Mestre libera pelo Altar da Relíquia, Capítulo 1.
        passivasVerdadeira: [], runasVerdadeira: [], passivasFantasma: [], runasFantasma: [],
        estadoAtivo: 'base', acessoVerdadeira: true, acessoFantasma: false
    },
    
    hierarquia: { poder: false, infinity: false, singularidade: '', poderNome: '', poderDesc: '', infinityNome: '', infinityDesc: '', singularidadeNome: '', singularidadeDesc: '' },
    proficienciaBase: 2, proficiencias: {}, avatar: { base: "" },
    
    bio: { raca: "", classe: "", idade: "", fisico: "", sangue: "", alinhamento: "", afiliacao: "", dinheiro: "", apelido: "", nivel: 0 },
    
    afinidades: { resistencias: [], vulnerabilidades: [], imunidades: [], absorcoes: [] },
    condicoes: [], 
    
    notas: [], // 🔥 CORRIGIDO: As notas agora nascem como um Array vazio e não dão conflito!
    
    posicao: { x: 0, y: 0, z: 0 }, iniciativa: 0,
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
    
    estetica: {}, labels: {}, pv: { atual: 0 }, pm: { atual: 0 }, multiplicadorVida: 1, multiplicadorMorte: 1, multiplicadorForcaPrestigio: 1, multiplicadorForcaAscensao: 1,

    divisorPoder: 0,
    supressaoPoder: 100, limiteSupressao: 1,

    energiaForca: { atual: 0 },

    statusPool: 0,
    statusPoolGasto: 0,
    statusPoolUnidadeV2: true,
    statusPrestigioAplicado: 0,
    statusPoolAlocado: {},

    combate: {
        municoTurnos: 0, municoPorTurno: 5,
        fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0,
        danoAbsorvido: 0, danoTotalRecebido: 0, letalidadeTotalRecebida: 0,
        conversaoAlvo: 10000, conversaoBonus: 1,
        furiaMax: 0,
        leis: [], copias: [],
    }
};

export function sanitizarNome(n) { return !n ? '' : n.replace(/[.#$\[\]\/]/g, '_').trim(); }
function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

const storedMesaId = localStorage.getItem('rpg_mesaId') || '';

// 🔥 REGISTROS AKÁSHICOS (Lore da Sexta-Feira): única fonte de verdade no Zustand,
// para que o HUD do Mestre (MapaSextaFeira) e o painel do Oráculo (AIFormContext)
// nunca mais dessincronizem via localStorage/eventos de window.
const loreCapitulosPresentePadrao = [{ id: 1, titulo: 'Capítulo 1 - Reino de Faku', arcos: [{ id: 11, titulo: 'Arco 1 - O Início', texto: 'A jornada começa...' }], tierList: [] }];
const loreCapitulosFuturoPadrao = [{ id: 100, titulo: 'Ecos do Futuro - Parte 1', arcos: [{ id: 101, titulo: 'Arco Principal', texto: 'Crônicas do Amanhã...' }], tierList: [] }];

function migrarLoreParaArcos(salvoStr) {
    try {
        if (!salvoStr) return null;
        const parsed = JSON.parse(salvoStr);
        return parsed.map(c => {
            let migrated = { ...c, tierList: c.tierList || [] };
            if (!migrated.arcos) {
                migrated.arcos = [{ id: Date.now() + Math.random(), titulo: 'Arco Principal', texto: c.texto || '' }];
                delete migrated.texto;
            }
            return migrated;
        });
    } catch (e) { return null; }
}

function lerLoreLocal(chave, padrao) {
    const migrado = migrarLoreParaArcos(localStorage.getItem(chave));
    return migrado || padrao;
}
function lerLoreNumeroLocal(chave, padrao) {
    return Number(localStorage.getItem(chave)) || padrao;
}

function getDivisorPoderMesaKey(mesaId) { return `rpg_divisorPoderMesa_${mesaId || 'semMesa'}`; }
function lerDivisorPoderMesaLocal(mesaId) {
    const raw = localStorage.getItem(getDivisorPoderMesaKey(mesaId));
    const val = parseFloat(raw);
    return (!isNaN(val) && val > 0) ? val : 1;
}

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
            state.divisorPoderMesa = lerDivisorPoderMesaLocal(id);
        }),
        minhaFicha: deepClone(fichaPadrao),
        meuNome: '', isMestre: false, abaAtiva: 'aba-ficha', personagens: {}, feedCombate: [],
        efeitosTemp: [], efeitosTempPassivos: [], efeitosTempArsenal: [], efeitosTempPassivosArsenal: [], efeitosTempForma: [], efeitosTempPassivosForma: [],
        formaEditandoId: null, poderEditandoId: null, itemEditandoId: null, elemEditandoId: null, personagemParaDeletar: '',
        dummies: {}, alvoSelecionado: null,
        
        ignorarTravaAcerto: false,
        pastasFechadasMapaTecnicas: {},
        cenario: { ativa: 'default', lista: { default: { nome: 'Cenário Inicial', img: '', escala: 1.5, unidade: 'm' } } },
        divisorPoderMesa: lerDivisorPoderMesaLocal(storedMesaId),

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
        setIgnorarTravaAcerto: (val) => set((state) => { state.ignorarTravaAcerto = val; }),
        setPastasFechadasMapaTecnicas: (mapa) => set((state) => { state.pastasFechadasMapaTecnicas = mapa; }),
        setPersonagemParaDeletar: (nome) => set((state) => { state.personagemParaDeletar = nome; }),
        setAbaAtiva: (aba) => set((state) => { state.abaAtiva = aba; }),
        setPersonagens: (personagens) => set((state) => { state.personagens = personagens; }),
        addFeedEntry: (entry) => set((state) => { state.feedCombate.push(entry); }),
        limparFeedStore: () => set(state => { state.feedCombate = []; }),
        setDummies: (dummies) => set((state) => { state.dummies = dummies || {}; }),
        setAlvoSelecionado: (id) => set((state) => { state.alvoSelecionado = id; }),
        setCenario: (dados) => set((state) => { state.cenario = dados; }),
        setDivisorPoderMesa: (valor) => set((state) => {
            const v = (parseFloat(valor) > 0) ? parseFloat(valor) : 1;
            state.divisorPoderMesa = v;
            try { localStorage.setItem(getDivisorPoderMesaKey(state.mesaId), String(v)); } catch (e) { }
        }),
        updateFicha: (callback) => set((state) => { callback(state.minhaFicha); }),

        loreCapitulosPresente: lerLoreLocal('rpgSextaFeira_capitulos', loreCapitulosPresentePadrao),
        loreCapituloAtivoId: lerLoreNumeroLocal('rpgSextaFeira_capituloAtivo', 1),
        loreArcoAtivoIdPresente: lerLoreNumeroLocal('rpgSextaFeira_arcoAtivoPresente', 11),
        loreCapitulosFuturo: lerLoreLocal('rpgSextaFeira_capitulosFuturo', loreCapitulosFuturoPadrao),
        loreCapFuturoAtivoId: lerLoreNumeroLocal('rpgSextaFeira_capFuturoAtivo', 100),
        loreArcoAtivoIdFuturo: lerLoreNumeroLocal('rpgSextaFeira_arcoAtivoFuturo', 101),

        setLoreCapitulosPresente: (updater) => set((state) => { state.loreCapitulosPresente = typeof updater === 'function' ? updater(state.loreCapitulosPresente) : updater; }),
        setLoreCapituloAtivoId: (updater) => set((state) => { state.loreCapituloAtivoId = typeof updater === 'function' ? updater(state.loreCapituloAtivoId) : updater; }),
        setLoreArcoAtivoIdPresente: (updater) => set((state) => { state.loreArcoAtivoIdPresente = typeof updater === 'function' ? updater(state.loreArcoAtivoIdPresente) : updater; }),
        setLoreCapitulosFuturo: (updater) => set((state) => { state.loreCapitulosFuturo = typeof updater === 'function' ? updater(state.loreCapitulosFuturo) : updater; }),
        setLoreCapFuturoAtivoId: (updater) => set((state) => { state.loreCapFuturoAtivoId = typeof updater === 'function' ? updater(state.loreCapFuturoAtivoId) : updater; }),
        setLoreArcoAtivoIdFuturo: (updater) => set((state) => { state.loreArcoAtivoIdFuturo = typeof updater === 'function' ? updater(state.loreArcoAtivoIdFuturo) : updater; }),

        // 🔥 PONTE DEFINITIVA: o HUD (MapaSextaFeira) chama esta ação diretamente — sem
        // localStorage, sem CustomEvent — e o Oráculo (AIFormContext) já está no mesmo
        // store, então a <textarea> dos Registros Akáshicos reage instantaneamente.
        injetarFalaNoArcoAtivo: (linhaFormatada) => set((state) => {
            const capId = state.loreCapituloAtivoId;
            const arcId = state.loreArcoAtivoIdPresente;
            const cap = state.loreCapitulosPresente.find(c => c.id === capId);
            const arco = cap?.arcos?.find(a => a.id === arcId);
            if (!arco) return;
            const sep = arco.texto && arco.texto.trim() ? '\n' : '';
            arco.texto = arco.texto + sep + linhaFormatada;
        }),

        carregarDadosFicha: (dados) => set((state) => {
            if (!dados) return;
            const chaves = Object.keys(fichaPadrao);
            
            if (dados.donoDaFicha !== undefined) state.minhaFicha.donoDaFicha = dados.donoDaFicha;
            
            if (dados.ascensaoBase !== undefined) state.minhaFicha.ascensaoBase = parseInt(dados.ascensaoBase) || 1;
            if (dados.iniciativa !== undefined) state.minhaFicha.iniciativa = parseInt(dados.iniciativa) || 0;
            if (dados.proficienciaBase !== undefined) state.minhaFicha.proficienciaBase = parseInt(dados.proficienciaBase) || 0;
            if (dados.proficiencias !== undefined) state.minhaFicha.proficiencias = dados.proficiencias || {};
            if (dados.divisores) state.minhaFicha.divisores = Object.assign({}, fichaPadrao.divisores, dados.divisores);
            if (dados.statusPoolAlocado) state.minhaFicha.statusPoolAlocado = Object.assign({}, fichaPadrao.statusPoolAlocado, dados.statusPoolAlocado);
            if (dados.combate) state.minhaFicha.combate = Object.assign({}, fichaPadrao.combate, dados.combate);
            if (dados.ataqueConfig) state.minhaFicha.ataqueConfig = Object.assign({}, fichaPadrao.ataqueConfig, dados.ataqueConfig);
            if (dados.avatar) state.minhaFicha.avatar = Object.assign({}, fichaPadrao.avatar, dados.avatar);
            else state.minhaFicha.avatar = { base: "" };
            if (dados.bio) state.minhaFicha.bio = Object.assign({}, fichaPadrao.bio, dados.bio);
            
            if (dados.afinidades) state.minhaFicha.afinidades = Object.assign({}, fichaPadrao.afinidades, dados.afinidades);
            if (dados.condicoes) state.minhaFicha.condicoes = dados.condicoes || [];

            if (dados.estetica) state.minhaFicha.estetica = Object.assign({}, fichaPadrao.estetica, dados.estetica);
            if (dados.labels) state.minhaFicha.labels = Object.assign({}, fichaPadrao.labels, dados.labels);
            if (dados.pv) state.minhaFicha.pv = Object.assign({}, fichaPadrao.pv, dados.pv);
            if (dados.pm) state.minhaFicha.pm = Object.assign({}, fichaPadrao.pm, dados.pm);
            if (dados.multiplicadorVida !== undefined) state.minhaFicha.multiplicadorVida = parseFloat(dados.multiplicadorVida) || 1;
            if (dados.multiplicadorMorte !== undefined) state.minhaFicha.multiplicadorMorte = parseFloat(dados.multiplicadorMorte) || 1;
            if (dados.multiplicadorForcaPrestigio !== undefined) state.minhaFicha.multiplicadorForcaPrestigio = parseFloat(dados.multiplicadorForcaPrestigio) || 1;
            if (dados.multiplicadorForcaAscensao !== undefined) state.minhaFicha.multiplicadorForcaAscensao = parseFloat(dados.multiplicadorForcaAscensao) || 1;

            if (dados.esteticaGrimorio) state.minhaFicha.esteticaGrimorio = Object.assign({}, fichaPadrao.esteticaGrimorio, dados.esteticaGrimorio);
            state.minhaFicha.habilidades = dados.habilidades || [];
            state.minhaFicha.formas = dados.formas || [];

            // 🔥 A MEMÓRIA DA ARMA ESPIRITUAL E NOTAS FOI RESTAURADA 🔥
            if (dados.armaEspiritual) {
                state.minhaFicha.armaEspiritual = dados.armaEspiritual;
            } else {
                state.minhaFicha.armaEspiritual = deepClone(fichaPadrao.armaEspiritual);
            }

            // 🔥 Migração Segura: Se "notas" era um objeto antigo, transformamos num Diário (Array)
            if (dados.notas) {
                if (Array.isArray(dados.notas)) {
                    state.minhaFicha.notas = dados.notas;
                } else if (typeof dados.notas === 'object') {
                    state.minhaFicha.notas = [];
                    if (dados.notas.base) state.minhaFicha.notas.push({ id: Date.now(), titulo: "Notas Base", texto: dados.notas.base });
                    if (dados.notas.geral) state.minhaFicha.notas.push({ id: Date.now()+1, titulo: "Geral", texto: dados.notas.geral });
                    if (dados.notas.abs) state.minhaFicha.notas.push({ id: Date.now()+2, titulo: "Absoluto", texto: dados.notas.abs });
                }
            } else {
                state.minhaFicha.notas = [];
            }

            if (dados.posicao) state.minhaFicha.posicao = Object.assign({}, fichaPadrao.posicao, dados.posicao);
            state.minhaFicha.inventario = dados.inventario || [];
            
            state.minhaFicha.poderes = [...(dados.poderes || []), ...migrarPassivasParaPoderes(dados.passivas)];
            state.minhaFicha.ataquesElementais = dados.ataquesElementais || [];
            state.minhaFicha.passivas = [];
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
                // 🔥 PROTEÇÃO ABSOLUTA: A 'armaEspiritual' não pode entrar neste Loop genérico!
                if (dados[ch] !== undefined && ch !== 'armaEspiritual' && ch !== 'esteticaGrimorio' && ch !== 'habilidades' && ch !== 'formas' && ch !== 'donoDaFicha' && ch !== 'ascensaoBase' && ch !== 'poderes' && ch !== 'divisores' && ch !== 'inventario' && ch !== 'ataquesElementais' && ch !== 'ataqueConfig' && ch !== 'avatar' && ch !== 'bio' && ch !== 'afinidades' && ch !== 'condicoes' && ch !== 'notas' && ch !== 'passivas' && ch !== 'seresSelados' && ch !== 'posicao' && ch !== 'iniciativa' && ch !== 'acoes' && ch !== 'proficienciaBase' && ch !== 'proficiencias' && ch !== 'cores' && ch !== 'hierarquia' && ch !== 'dominios' && ch !== 'estetica' && ch !== 'labels' && ch !== 'pv' && ch !== 'pm' && ch !== 'multiplicadorVida' && ch !== 'multiplicadorMorte' && ch !== 'multiplicadorForcaPrestigio' && ch !== 'multiplicadorForcaAscensao' && ch !== 'statusPoolAlocado' && ch !== 'combate') {
                    if (typeof fichaPadrao[ch] === 'object' && !Array.isArray(fichaPadrao[ch])) {
                        state.minhaFicha[ch] = Object.assign({}, fichaPadrao[ch], dados[ch]);
                        const numF = ['base', 'mBase', 'mGeral', 'mFormas', 'mAbsoluto', 'reducaoCusto', 'regeneracao', 'atual'];
                        for (let j = 0; j < numF.length; j++) { if (state.minhaFicha[ch][numF[j]] == null || isNaN(state.minhaFicha[ch][numF[j]])) { state.minhaFicha[ch][numF[j]] = fichaPadrao[ch][numF[j]]; } }
                    } else { state.minhaFicha[ch] = dados[ch]; }
                }
            }

            if (!dados.statusPoolUnidadeV2 && dados.statusPoolGasto === undefined) {
                const poolAntigo = parseFloat(dados.statusPool) || 0;
                if (poolAntigo !== 0) {
                    const divStatus = parseFloat((dados.divisores || fichaPadrao.divisores).status) || 1;
                    state.minhaFicha.statusPool = Math.floor((poolAntigo * divStatus) / 1000);
                }
                state.minhaFicha.statusPoolUnidadeV2 = true;
            } else if (!dados.statusPoolUnidadeV2) {
                state.minhaFicha.statusPoolUnidadeV2 = true;
            }

            if (dados.statusPrestigioAplicado === undefined) {
                state.minhaFicha.statusPrestigioAplicado = Math.floor(((parseFloat(state.minhaFicha.statusPool) || 0) + (parseFloat(state.minhaFicha.statusPoolGasto) || 0)) / 8);
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