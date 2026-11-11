// ==========================================
// 🧩 MODELOS PRONTOS DE PODER — lógica pura. O Mestre concede de uma vez o poder + contadores + gatilhos de uma mecânica
// que hoje exigiria percorrer várias telas (Ego Superior, Verg Avesta). Nada aqui toca em React nem no Firebase.
//
// Catálogo: MODELOS = [{ id, nome, resumo, categoria, temOrigem?, partes: [{ id, rotulo, descricao, padrao, parametros, suportado }], construir }]
//   suportado: true = vira regra do app | 'nota' = não existe no app e vira NOTA na descrição do poder (o Mestre aplica à mão).
//   construir(selecao, params, fichaAtual, opcoes) => { poder, contadores, reaproveitados, avisos }.
// Marcas no poder (campos opcionais; o resto do app os ignora): poder.modelo = { id, partes, params } e poder.origem = { tipo, fonte }.
// Gatilhos criados têm id `mp_<modelo>_<parte>_<n>` (o id dá para saber de que parte vieram, pois normalizarGatilhos só guarda campos conhecidos);
// os efeitos têm nome fixo por parte; os contadores têm id fixo `mp_<modelo>_<nome>`. Por isso "Editar partes" regenera o que o modelo
// criou antes e troca só isso, sem tocar no que o Mestre/jogador acrescentou à mão.
//
// SUPOSIÇÕES (detalhe em D:\sistema rpg anime\ficha-referencia\modelos-prontos.md):
//  - Os valores de ganho (+2/+3/+4 etc.) são somados DIRETO em ficha.ganhosPermanentes.poderCalculado (ação `ganhoPermanente`), como o usuário decidiu.
//  - Gatilhos nascem `automatico` + `armado` (o Mestre concede de propósito); a opção `criarOpcionais` os cria opcionais e desarmados.
//  - Verg: o Acerto por turno é +N FIXO (somarBuffTemporario substitui buff de mesmo nome/fonte; não acumula), com nome de gatilho constante.
//  - Ego: o contador de críticos sofridos tem reset 'cena' (os críticos sofridos pela metade se perdem ao fim da cena; pergunta aberta ao usuário).
//  - O contador que alimenta um ganho em `fimDeLuta` é PERMANENTE (não 'cena'): resetarContadoresDeCena roda ANTES dos gatilhos de fimDeLuta
//    (core/gatilhosAplicar.js > dispararEventoNaFicha) e zeraria o contador antes de o ganho lê-lo. O próprio ganho zera o contador (zerar: true).
// ==========================================
import { normalizarPoder } from './sextaFeiraCriacao.js';
import { normalizarGatilhos, LIMITE_GATILHOS_POR_FONTE } from './gatilhos.js';
import { normalizarContador, listaDeContadores, LIMITE_CONTADORES } from './contadores.js';

export const ORIGENS_PODER = [
    { id: 'herdada', rotulo: 'Herdada de um ser' },
    { id: 'independente', rotulo: 'Independente' },
];
const LIMITE_EFEITOS = 12;
const LIMITE_FONTE_ORIGEM = 60;

const numero = (v, padrao) => { if (v === '' || v === null || v === undefined) return padrao; const n = Number(v); return Number.isFinite(n) ? n : padrao; };
const preso = (n, min, max) => Math.max(min, Math.min(max, n));

// ---------- Origem (só informativa; a mecânica é a mesma nos dois casos) ----------
export function normalizarOrigem(bruta) {
    const o = bruta && typeof bruta === 'object' ? bruta : {};
    const tipo = ORIGENS_PODER.some(x => x.id === o.tipo) ? o.tipo : 'herdada';
    return { tipo, fonte: String(o.fonte ?? '').trim().slice(0, LIMITE_FONTE_ORIGEM) };
}

// Texto curto do selo no cartão do poder; '' se o poder não tem origem.
export function descreverOrigem(origem) {
    if (!origem || typeof origem !== 'object' || !ORIGENS_PODER.some(x => x.id === origem.tipo)) return '';
    if (origem.tipo === 'independente') return 'Independente';
    const fonte = String(origem.fonte ?? '').trim();
    return fonte ? `Herdada de ${fonte}` : 'Herdada de um ser';
}

// ---------- Blocos de gatilho ----------
const idGatilho = (modelo, parte, n) => `mp_${modelo}_${parte}_${n}`;
const idContador = (modelo, nome) => `mp_${modelo}_${nome}`;

// ---------- 🌟 EGO SUPERIOR ----------
const ID_CONTADOR_EGO = idContador('ego', 'criticos');

const EGO = {
    id: 'egoSuperior',
    curto: 'ego',
    nome: 'Ego Superior',
    resumo: 'Forma Especial com 140x em Vida, Dano, Status e Energias; ganha Poder permanente por acerto e por golpe crítico/fatal sofrido; imune a condições.',
    categoria: 'forma',
    temOrigem: false,
    descricao: 'Forma Especial. Cada acerto e golpe crítico/fatal sofrido soma Poder permanente (Poder Calculado). Energia Potencial: sem limite (ignorada pelo app).',
    partes: [
        {
            id: 'multiplicadores', rotulo: 'Multiplicador x140', suportado: true, padrao: true,
            descricao: 'Vida, Dano, todos os Status e todas as Energias multiplicados (E-46). Cura x140 vira nota.',
            parametros: [{ id: 'fatorEgo', rotulo: 'Multiplicador', tipo: 'numero', padrao: 140, min: 1, max: 100000 }],
        },
        {
            id: 'prestigioPorAcerto', rotulo: 'Poder por acerto', suportado: true, padrao: true,
            descricao: 'Cada acerto soma Poder permanente: normal, crítico e fatal (E-51).',
            parametros: [
                { id: 'ganhoNormal', rotulo: 'Acerto normal', tipo: 'numero', padrao: 2, min: 0, max: 1000 },
                { id: 'ganhoCritico', rotulo: 'Acerto crítico', tipo: 'numero', padrao: 3, min: 0, max: 1000 },
                { id: 'ganhoFatal', rotulo: 'Acerto fatal', tipo: 'numero', padrao: 4, min: 0, max: 1000 },
            ],
        },
        {
            id: 'prestigioPorDanoSofrido', rotulo: 'Poder por crítico/fatal sofrido', suportado: true, padrao: true,
            descricao: 'A cada N críticos sofridos (contador) ou 1 fatal sofrido, soma Poder permanente (E-50).',
            parametros: [
                { id: 'criticosPorGanho', rotulo: 'Críticos sofridos por ganho', tipo: 'numero', padrao: 3, min: 1, max: 100 },
                { id: 'ganhoPorCriticos', rotulo: 'Ganho a cada série de críticos', tipo: 'numero', padrao: 2, min: 0, max: 1000 },
                { id: 'ganhoPorFatal', rotulo: 'Ganho por fatal sofrido', tipo: 'numero', padrao: 2, min: 0, max: 1000 },
            ],
        },
        {
            id: 'imunidadeCondicoes', rotulo: 'Imune a condições', suportado: true, padrao: true,
            descricao: 'Não recebe nenhum estado enquanto a forma estiver ligada (E-59).',
            parametros: [],
        },
        {
            id: 'ascensaoAdicional', rotulo: 'Ascensão adicional (+10)', suportado: 'nota', padrao: true,
            descricao: '+10 de Ascensão em cada; os pontos viram pontos de morte/vida temporários (E-48). Vira nota.',
            parametros: [],
        },
        {
            id: 'habilidadesDeRaca', rotulo: 'Habilidades viram poderes de raça', suportado: 'nota', padrao: true,
            descricao: 'Todas as habilidades nesta forma contam como poderes de raça (E-49). Vira nota.',
            parametros: [],
        },
    ],
    // Cada parte devolve { efeitos, gatilhos, contadores, notas }.
    montar: {
        multiplicadores: (p) => {
            const valor = String(preso(numero(p.fatorEgo, 140), 1, 100000));
            const efeito = (nome, atributo) => ({ nome: `Ego Superior: ${nome}`, atributo, propriedade: 'munico', valor });
            return {
                efeitos: [efeito('Vida', 'vida'), efeito('Dano', 'dano'), efeito('Status', 'todos_status'), efeito('Energias', 'todas_energias')],
                notas: [`Cura x${valor}: o app não tem atributo de Cura; aplique à mão.`],
            };
        },
        prestigioPorAcerto: (p) => {
            const gatilhos = [];
            [['normal', 'ganhoNormal', 'normal'], ['critico', 'ganhoCritico', 'crítico'], ['fatal', 'ganhoFatal', 'fatal']].forEach(([nivel, chave, rotulo], i) => {
                const valor = numero(p[chave], 0);
                if (valor > 0) gatilhos.push({ id: idGatilho('ego', 'acerto', i + 1), nome: `Ego: +${valor} por acerto ${rotulo}`, evento: { tipo: 'acertou', nivel }, acoes: [{ tipo: 'ganhoPermanente', valor }] });
            });
            return { gatilhos };
        },
        prestigioPorDanoSofrido: (p) => {
            const gatilhos = []; const contadores = [];
            const porSerie = Math.floor(preso(numero(p.criticosPorGanho, 3), 1, 100));
            const ganhoSerie = numero(p.ganhoPorCriticos, 0);
            const ganhoFatal = numero(p.ganhoPorFatal, 0);
            if (ganhoSerie > 0) {
                contadores.push({ id: ID_CONTADOR_EGO, nome: 'Ego: críticos sofridos', min: 0, max: porSerie, reset: 'cena' });
                gatilhos.push({ id: idGatilho('ego', 'dano', 1), nome: 'Ego: conta crítico sofrido', evento: { tipo: 'atingido', nivel: 'critico' }, acoes: [{ tipo: 'contador', id: ID_CONTADOR_EGO, op: 'somar', valor: 1 }] });
                gatilhos.push({
                    id: idGatilho('ego', 'dano', 2), nome: `Ego: +${ganhoSerie} a cada ${porSerie} críticos sofridos`,
                    evento: { tipo: 'contadorAtingiu', contadorId: ID_CONTADOR_EGO, op: '>=', valor: porSerie },
                    acoes: [{ tipo: 'ganhoPermanente', valor: ganhoSerie }, { tipo: 'contador', id: ID_CONTADOR_EGO, op: 'zerar' }],
                });
            }
            if (ganhoFatal > 0) gatilhos.push({ id: idGatilho('ego', 'dano', 3), nome: `Ego: +${ganhoFatal} por fatal sofrido`, evento: { tipo: 'atingido', nivel: 'fatal' }, acoes: [{ tipo: 'ganhoPermanente', valor: ganhoFatal }] });
            return { gatilhos, contadores };
        },
        imunidadeCondicoes: () => ({ efeitos: [{ nome: 'Ego Superior: imune a condições', atributo: 'imune_estado', propriedade: 'base', valor: '1', escopo: 'todos' }] }),
        ascensaoAdicional: () => ({ notas: ['Ascensão adicional: +10 de Ascensão em cada ao ativar; os pontos de prestígio adicionais viram pontos de morte e vida temporários (aplique à mão). Os ganhos por acerto/crítico sofrido não contam para esses pontos.'] }),
        habilidadesDeRaca: () => ({ notas: ['Nesta forma, todas as habilidades contam como poderes de raça.'] }),
    },
};

// ---------- 🌀 VERG AVESTA ----------
const ID_CONTADOR_VERG = idContador('verg', 'acumulo');

const VERG = {
    id: 'vergAvesta',
    curto: 'verg',
    nome: 'Verg Avesta',
    resumo: 'Habilidade que acumula o que sofre e, ao fim da luta, converte em Poder permanente; ganha +N de Acerto por turno (fixo, não acumula).',
    categoria: 'habilidade',
    temOrigem: true,
    descricao: 'Habilidade passiva: acumula os golpes sofridos e, ao fim da luta (cena), o acumulado vira Poder permanente.',
    partes: [
        {
            id: 'acumuloDeDano', rotulo: 'Acúmulo → ganho permanente', suportado: true, padrao: true,
            descricao: 'Conta cada golpe que causa dano na Vida; no fim da cena o acumulado ÷ divisor vira Poder permanente e o contador zera (A-31).',
            parametros: [
                { id: 'divisor', rotulo: 'Divisor do acumulado (1/10 a 1/6)', tipo: 'numero', padrao: 10, min: 1, max: 1000 },
                { id: 'limiteAcumulo', rotulo: 'Máximo do contador', tipo: 'numero', padrao: 999, min: 1, max: 9999 },
            ],
        },
        {
            id: 'acertoPorTurno', rotulo: 'Acerto por turno (+N fixo, não acumula)', suportado: true, padrao: true,
            descricao: 'No início de cada turno em combate, +N de Acerto por turno (não acumula: o buff é renovado) (A-31).',
            parametros: [{ id: 'acertoPorTurno', rotulo: 'Acerto por turno', tipo: 'numero', padrao: 5, min: 1, max: 1000 }],
        },
        {
            id: 'vidaMaxima', rotulo: 'Vida máxima ÷ 8', suportado: 'nota', padrao: true,
            descricao: 'A vida máxima soma o dano total sofrido ÷ 8. Vira nota.', parametros: [],
        },
        {
            id: 'curaAcumulada', rotulo: 'Cura acumulada', suportado: 'nota', padrao: true,
            descricao: 'A cura recebida também acumula (1/20-1/10, ao fim 1/200-1/80). Vira nota.', parametros: [],
        },
        {
            id: 'adaptacao', rotulo: 'Resistência/imunidade por tipo', suportado: 'nota', padrao: true,
            descricao: 'Resistência e imunidade a um tipo de dano após N ataques do mesmo tipo. O app não tem adaptação por tipo. Vira nota.', parametros: [],
        },
        {
            id: 'expansao', rotulo: 'Expansão: x4, x6, x8, x10, x25', suportado: 'nota', padrao: true,
            descricao: 'Na expansão, multiplicadores por turno (a esfera gira). Vira nota.', parametros: [],
        },
    ],
    montar: {
        acumuloDeDano: (p) => {
            const divisor = preso(numero(p.divisor, 10), 1, 1000);
            const maximo = Math.floor(preso(numero(p.limiteAcumulo, 999), 1, 9999));
            const fator = Math.round((1 / divisor) * 1e6) / 1e6;
            return {
                contadores: [{ id: ID_CONTADOR_VERG, nome: 'Verg Avesta: acumulado', min: 0, max: maximo }],
                gatilhos: [
                    { id: idGatilho('verg', 'acumulo', 1), nome: 'Verg: acumula o golpe sofrido', evento: { tipo: 'atingido', nivel: 'qualquer' }, passivo: true, acoes: [{ tipo: 'contador', id: ID_CONTADOR_VERG, op: 'somar', valor: 1 }] },
                    { id: idGatilho('verg', 'acumulo', 2), nome: `Verg: acumulado ÷ ${divisor} vira Poder`, evento: { tipo: 'fimDeLuta' }, passivo: true, acoes: [{ tipo: 'ganhoPermanente', deContador: { id: ID_CONTADOR_VERG, fator, zerar: true } }] },
                ],
                notas: ['Acúmulo: o app conta GOLPES sofridos (não o dano exato); o Mestre ajusta o total em "Ganhos permanentes" se quiser o valor exato.'],
            };
        },
        acertoPorTurno: (p) => {
            const valor = preso(numero(p.acertoPorTurno, 5), 1, 1000);
            // Nome CONSTANTE (o buff do app se chama "<gatilho> (acerto)" e um novo buff de mesmo nome/fonte SUBSTITUI o anterior):
            // mudar o valor em "Editar partes" não deixa um buff antigo com outro nome.
            return {
                gatilhos: [{ id: idGatilho('verg', 'acerto', 1), nome: 'Verg: Acerto por turno', evento: { tipo: 'turnoInicio' }, passivo: true, acoes: [{ tipo: 'buff', atributo: 'acerto', valor, duracao: 20, modo: 'combate' }] }],
                notas: [`Acerto por turno: +${valor} de Acerto a cada turno em combate (não acumula: o buff é renovado, não somado). Acúmulo de turno a turno, se desejado, é à mão.`],
            };
        },
        vidaMaxima: () => ({ notas: ['Vida máxima: soma o dano total sofrido ÷ 8 (aplique à mão).'] }),
        curaAcumulada: () => ({ notas: ['Cura acumulada: 1/20 a 1/10 do curado acumula; ao fim da luta 1/200 a 1/80 vira ganho (aplique à mão).'] }),
        adaptacao: () => ({ notas: ['Adaptação: resistência após 3 a 6 ataques do mesmo tipo e imunidade após 4 a 7, conforme a categoria do dano (básicos 3/2 resistência e 5/4 imunidade; verdadeiros 4/3 e 5/4; avançados e Luz/Escuridão/Éter 5/4 e 6/5; avançados verdadeiros e Infernal/Celestial/Caos 6/5 e 7/6). O app não tem adaptação por tipo: ajuste as afinidades à mão.'] }),
        expansao: () => ({ notas: ['Expansão: a cada turno a esfera gira e deixa x4, x6, x8, x10, x25; após 3 turnos, domínio total do poder do alvo (aplique à mão).'] }),
    },
};

// Seleção/parâmetros válidos de um modelo (partes desconhecidas somem; numéricos presos a [min, max]).
const todasAsPartes = (m) => m.partes;
const parametrosDe = (m) => m.partes.flatMap(p => p.parametros);

export const paramsPadrao = (m) => Object.fromEntries(parametrosDe(m).map(p => [p.id, p.padrao]));
export const selecaoPadrao = (m) => todasAsPartes(m).filter(p => p.padrao).map(p => p.id);

export function normalizarSelecao(m, selecao) {
    const pedidas = new Set(Array.isArray(selecao) ? selecao : []);
    return todasAsPartes(m).filter(p => pedidas.has(p.id)).map(p => p.id);
}
export function normalizarParams(m, params) {
    const bruto = params && typeof params === 'object' ? params : {};
    return Object.fromEntries(parametrosDe(m).map(p => [p.id, preso(numero(bruto[p.id], p.padrao), p.min, p.max)]));
}

// Material de UMA seleção (sem ficha): efeitos, gatilhos, contadores e notas, nesta ordem de partes.
function materialDaSelecao(m, selecao, params) {
    const sel = normalizarSelecao(m, selecao);
    const par = normalizarParams(m, params);
    const saida = { efeitos: [], gatilhos: [], contadores: [], notas: [] };
    todasAsPartes(m).filter(p => sel.includes(p.id)).forEach((p) => {
        const r = m.montar[p.id](par) || {};
        saida.efeitos.push(...(r.efeitos || []));
        saida.gatilhos.push(...(r.gatilhos || []));
        saida.contadores.push(...(r.contadores || []));
        saida.notas.push(...(r.notas || []));
    });
    return { sel, par, ...saida };
}

const marcarModo = (g, criarOpcionais) => (criarOpcionais ? { ...g, modo: 'opcional', armado: false } : { ...g, modo: 'automatico', armado: true });

// Constrói o poder do modelo já validado (normalizarPoder + normalizarGatilhos + normalizarContador). Nunca muta a ficha.
function construirDoModelo(m, selecao, params, fichaAtual, opcoes = {}) {
    const mat = materialDaSelecao(m, selecao, params);
    const avisos = [];
    const bruto = {
        nome: m.nome, descricao: m.descricao, categoria: m.categoria,
        efeitos: mat.efeitos.slice(0, LIMITE_EFEITOS),
    };
    const { objeto, avisos: avisosPoder } = normalizarPoder(bruto);
    avisos.push(...avisosPoder.filter(a => !/^Falta o nome/.test(a)));
    const notasDasPartes = mat.notas;
    objeto.notasIA = notasDasPartes.join('\n');
    const { gatilhos, descartados } = normalizarGatilhos(mat.gatilhos.map(g => marcarModo(g, opcoes.criarOpcionais === true)));
    descartados.forEach(d => avisos.push(`Gatilho "${d.nome}" não foi criado: ${d.motivo}.`));
    if (mat.gatilhos.length > LIMITE_GATILHOS_POR_FONTE) avisos.push(`O modelo precisa de mais de ${LIMITE_GATILHOS_POR_FONTE} gatilhos: só os ${LIMITE_GATILHOS_POR_FONTE} primeiros foram mantidos.`);
    if (gatilhos.length > 0) objeto.gatilhos = gatilhos;
    if (m.temOrigem) objeto.origem = normalizarOrigem(opcoes.origem);
    objeto.modelo = { id: m.id, partes: mat.sel, params: mat.par };
    // Contadores: o helper único decide o que criar, reaproveitar (e ajustar) e remover.
    const pc = planejarContadores(m, fichaAtual, mat.sel, mat.par);
    mat.sel.forEach((id) => {
        const parte = m.partes.find(p => p.id === id);
        if (parte && parte.suportado === 'nota') avisos.push(`"${parte.rotulo}" não existe no app: entrou como nota na descrição.`);
    });
    return { poder: objeto, contadores: pc.paraCriar, reaproveitados: pc.paraAtualizar.map(c => String(c.id)), contadoresAtualizar: pc.paraAtualizar, contadoresRemover: [...pc.paraRemover], totalContadores: pc.total, avisos };
}

// Helper ÚNICO dos contadores (plano, construir e aplicar usam este): dado o que a seleção pede,
//  - paraCriar: contadores que faltam na ficha (já normalizados, valor = mínimo);
//  - paraAtualizar: contadores do modelo que já existem na ficha (mesmo id, inclusive órfãos de um poder apagado à mão): nome/min/max são reescritos, o valor é preservado e preso ao novo intervalo;
//  - paraRemover: ids que a seleção ANTIGA do modelo criou e a nova não usa mais (só no modo editar), e que ainda existem na ficha;
//  - total: quantos contadores a ficha terá depois de aplicar.
function planejarContadores(m, ficha, selecao, params) {
    const lista = listaDeContadores(ficha);
    const noFicha = new Set(lista.map(c => String(c.id)));
    const usados = materialDaSelecao(m, selecao, params).contadores;
    const idsUsados = new Set(usados.map(c => String(c.id)));
    const existente = acharPoderDoModelo(ficha, m.id);
    const paraRemover = new Set();
    if (existente && existente.modelo) {
        materialDaSelecao(m, existente.modelo.partes, existente.modelo.params).contadores
            .map(c => String(c.id))
            .filter(id => !idsUsados.has(id) && noFicha.has(id))
            .forEach(id => paraRemover.add(id));
    }
    const paraCriar = []; const paraAtualizar = [];
    usados.forEach((c) => {
        if (noFicha.has(String(c.id))) { paraAtualizar.push(c); return; }
        const n = normalizarContador({ ...c, valor: c.min });
        if (n) paraCriar.push(n);
    });
    return { paraCriar, paraAtualizar, paraRemover, total: lista.length - paraRemover.size + paraCriar.length };
}

// Gatilhos finais do poder no modo EDITAR, calculados ANTES de mutar qualquer coisa:
// os manuais (que o modelo não criou) ficam e os do modelo entram depois. Se algum gatilho do modelo seria descartado, `bloqueio` explica.
function gatilhosFinaisEdicao(m, existente, novo) {
    const antigo = materialDaSelecao(m, existente.modelo.partes, existente.modelo.params);
    const idsAntigos = new Set(antigo.gatilhos.map(g => g.id));
    const manter = (existente.gatilhos || []).filter(g => g && !idsAntigos.has(g.id));
    const doModelo = novo.poder.gatilhos || [];
    const juntos = normalizarGatilhos([...manter, ...doModelo]);
    const idsFinais = new Set(juntos.gatilhos.map(g => g.id));
    const perdidos = doModelo.filter(g => !idsFinais.has(g.id));
    const bloqueio = perdidos.length > 0
        ? `O poder já tem ${manter.length} gatilho(s) manual(is) e o limite é ${LIMITE_GATILHOS_POR_FONTE} por poder: ${perdidos.length} gatilho(s) do modelo não caberiam. Apague gatilhos manuais ou desmarque partes.`
        : '';
    return { gatilhos: juntos.gatilhos, descartados: juntos.descartados, bloqueio, antigo };
}

export const MODELOS = [EGO, VERG].map(m => ({
    id: m.id, nome: m.nome, resumo: m.resumo, categoria: m.categoria, temOrigem: m.temOrigem, partes: m.partes,
    construir: (selecao, params, fichaAtual, opcoes) => construirDoModelo(m, selecao, params, fichaAtual, opcoes),
    _def: m,
}));

export const obterModelo = (id) => MODELOS.find(m => m.id === id) || null;

// Poder da ficha criado por este modelo (modelo.id igual), ou null.
export const acharPoderDoModelo = (ficha, modeloId) => (ficha && Array.isArray(ficha.poderes) ? ficha.poderes.find(p => p && p.modelo && p.modelo.id === modeloId) || null : null);

// O que o Mestre vai ver antes de aplicar: { modo: 'novo'|'editar', poderes, contadores, gatilhos, efeitos, avisos, ok, erro }.
export function planejarModelo(modeloId, selecao, params, fichaAtual, opcoes = {}) {
    const m = obterModelo(modeloId);
    if (!m) return { ok: false, erro: 'Modelo desconhecido.', modo: 'novo', poderes: 0, contadores: 0, gatilhos: 0, efeitos: 0, avisos: [] };
    const sel = normalizarSelecao(m, selecao);
    if (sel.length === 0) return { ok: false, erro: 'Marque ao menos uma parte.', modo: 'novo', poderes: 0, contadores: 0, gatilhos: 0, efeitos: 0, avisos: [] };
    const r = m.construir(sel, params, fichaAtual, opcoes);
    const existente = acharPoderDoModelo(fichaAtual, modeloId);
    let erro = '';
    if (r.totalContadores > LIMITE_CONTADORES) erro = `A ficha só comporta ${LIMITE_CONTADORES} contadores (ficaria com ${r.totalContadores}). Apague algum e tente de novo.`;
    else if (existente) erro = gatilhosFinaisEdicao(m._def, existente, r).bloqueio;
    return {
        ok: !erro, erro,
        modo: existente ? 'editar' : 'novo', poderes: existente ? 0 : 1, contadores: r.contadores.length,
        contadoresAtualizados: r.contadoresAtualizar.length, contadoresRemovidos: r.contadoresRemover.length,
        gatilhos: (r.poder.gatilhos || []).length, efeitos: (r.poder.efeitos || []).length, avisos: r.avisos,
    };
}

// Aplica no RASCUNHO da ficha (use dentro de updateFicha). Só o Mestre: `req.isMestre` é conferido aqui também (a UI já esconde o botão).
// req: { modeloId, selecao, params, opcoes?: { origem, criarOpcionais }, isMestre, id? }
// Devolve { ok, mensagem, avisos, modo }. Poder do mesmo modelo já na ficha é ATUALIZADO (não duplica).
export function aplicarModeloNaFicha(ficha, req = {}) {
    if (req.isMestre !== true) return { ok: false, mensagem: 'Só o Mestre pode adicionar de modelo.', avisos: [] };
    const m = obterModelo(req.modeloId);
    if (!ficha || !m) return { ok: false, mensagem: 'Modelo ou ficha inválidos.', avisos: [] };
    const sel = normalizarSelecao(m, req.selecao);
    if (sel.length === 0) return { ok: false, mensagem: 'Marque ao menos uma parte.', avisos: [] };
    const opcoes = req.opcoes || {};
    const novo = m.construir(sel, req.params, ficha, opcoes);
    if (!Array.isArray(ficha.contadores)) ficha.contadores = [];
    if (!Array.isArray(ficha.poderes)) ficha.poderes = [];
    const existente = acharPoderDoModelo(ficha, m.id);

    // ---- Fase 1: valida TUDO antes de mutar (aplicação atômica: tudo ou nada) ----
    if (novo.totalContadores > LIMITE_CONTADORES) {
        return { ok: false, mensagem: `A ficha já tem contadores demais (máximo ${LIMITE_CONTADORES}; ficaria com ${novo.totalContadores}). Apague algum e tente de novo.`, avisos: novo.avisos };
    }
    const edicao = existente ? gatilhosFinaisEdicao(m._def, existente, novo) : null;
    if (edicao && edicao.bloqueio) return { ok: false, mensagem: edicao.bloqueio, avisos: novo.avisos };

    // ---- Fase 2: grava. Contadores do modelo já existentes são reescritos (nome/min/max; valor preservado e preso ao novo intervalo). ----
    // Os contadores do modelo pertencem ao poder: gravam `poderId` (migra também contadores mp_* antigos, sem poderId, ao editar).
    const poderId = existente ? existente.id : (req.id !== undefined ? req.id : Date.now());
    const remover = new Set(novo.contadoresRemover);
    const atualizar = new Map(novo.contadoresAtualizar.map(c => [String(c.id), c]));
    ficha.contadores = [
        ...ficha.contadores.filter(c => c && !remover.has(String(c.id))).map((c) => {
            const a = atualizar.get(String(c.id));
            return a ? (normalizarContador({ ...c, nome: a.nome, min: a.min, max: a.max, poderId }) || c) : c;
        }),
        ...novo.contadores.map(c => ({ ...c, poderId })),
    ];

    if (!existente) {
        ficha.poderes.push({ ...novo.poder, id: poderId });
        return { ok: true, modo: 'novo', avisos: novo.avisos, mensagem: `${m.nome} adicionado: ${(novo.poder.gatilhos || []).length} gatilho(s), ${novo.contadores.length} contador(es) novo(s).` };
    }

    // Editar partes: tira só o que o modelo criou antes (gatilhos por id, efeitos por nome) e põe o novo; o resto do poder fica.
    const antigo = edicao.antigo;
    const nomesAntigos = new Set(antigo.efeitos.map(e => e.nome));
    const avisos = [...novo.avisos];
    edicao.descartados.forEach(d => avisos.push(`Gatilho "${d.nome}" ficou de fora: ${d.motivo}.`));
    if (edicao.gatilhos.length > 0) existente.gatilhos = edicao.gatilhos; else delete existente.gatilhos;
    const efeitos = [...(existente.efeitos || []).filter(e => e && !nomesAntigos.has(e.nome)), ...(novo.poder.efeitos || [])];
    if (efeitos.length > LIMITE_EFEITOS) avisos.push(`O poder passou de ${LIMITE_EFEITOS} efeitos (${efeitos.length}).`);
    existente.efeitos = efeitos;
    // Notas: troca só se ainda forem as que o modelo escreveu; texto editado à mão fica.
    const notasAntigas = antigo.notas.join('\n');
    if (!existente.notasIA || existente.notasIA === notasAntigas) existente.notasIA = novo.poder.notasIA;
    else if (novo.poder.notasIA && !existente.notasIA.includes(novo.poder.notasIA)) existente.notasIA = `${existente.notasIA}\n${novo.poder.notasIA}`;
    if (m.temOrigem) existente.origem = novo.poder.origem;
    existente.modelo = novo.poder.modelo;
    return { ok: true, modo: 'editar', avisos, mensagem: `${m.nome} atualizado: ${(existente.gatilhos || []).length} gatilho(s) no poder.` };
}
